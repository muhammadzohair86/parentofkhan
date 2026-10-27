import { createHash } from "node:crypto";
import { MediaAsset } from "../models/MediaAsset.js";
import { Product } from "../models/Product.js";
import { Category } from "../models/Category.js";
import { SiteSetting } from "../models/SiteSetting.js";
import { Order } from "../models/Order.js";
import { escapeRegex } from "./escapeRegex.js";
import { createStorage } from "./storage.js";
import { createCloudinaryService } from "./cloudinaryService.js";
import { parseCloudinaryUrl, parseLocalUploadUrl } from "./cloudinaryUrl.js";

let media = null;
export const getMedia = () => media;

// Chooses the image store: Cloudinary when its credentials are configured, otherwise local disk (as before).
export async function initMedia(env) {
  const local = createStorage({ dir: env.uploadDir, publicBase: env.publicUploadBase });
  const cloud = env.cloudinary ? await createCloudinaryService(env.cloudinary) : null;
  const provider = cloud ? "cloudinary" : "local";
  media = { provider, local, cloud, maxBytes: env.uploadMaxBytes };
  return media;
}

// Stores an image (already type-checked by the caller). Identical bytes are never stored twice.
export async function saveImage(buffer, kind, userId) {
  const m = media;
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 32);
  const existing = await MediaAsset.findOne({ provider: m.provider, hash }).lean();
  if (existing) return { ...describe(existing), reused: true };

  let asset;
  if (m.cloud) {
    const r = await m.cloud.upload(buffer, `${m.cloud.folder}/${hash}`);
    asset = { provider: "cloudinary", hash, publicId: r.public_id, url: r.secure_url, width: r.width, height: r.height, bytes: r.bytes, format: r.format };
  } else {
    const saved = await m.local.save(buffer, kind.ext);
    asset = { provider: "local", hash, publicId: saved.name, url: saved.url, bytes: buffer.length, format: kind.ext };
  }
  try {
    await MediaAsset.create({ ...asset, createdBy: userId || null });
  } catch (e) {
    if (e?.code !== 11000) throw e; // two identical uploads raced: the unique index kept one record
  }
  return { ...asset, reused: false };
}

const describe = (a) => ({ provider: a.provider, url: a.url, publicId: a.publicId, width: a.width, height: a.height, bytes: a.bytes, format: a.format });

// Is this image still used by anything? (products, categories, homepage hero, and past orders' item snapshots)
async function isReferenced(key) {
  const rx = new RegExp(`/${escapeRegex(key)}(?:\\.[a-z0-9]+)?(?:$|\\?)`);
  const hits = await Promise.all([
    Product.exists({ $or: [{ frontImage: rx }, { backImage: rx }, { galleryImages: rx }, { "variants.images": rx }] }),
    Category.exists({ image: rx }),
    SiteSetting.exists({ $or: [{ "hero.desktopImage": rx }, { "hero.mobileImage": rx }] }),
    Order.exists({ "items.image": rx }),
  ]);
  return hits.some(Boolean);
}

// Call AFTER the database has been updated, with the image URLs that may have just become unused (old values).
// Each one is deleted only if nothing references it any more. Failures are logged and never fail the request.
export async function releaseImages(urls) {
  const m = media;
  if (!m) return;
  for (const url of [...new Set((urls || []).filter(Boolean))]) {
    try {
      const c = parseCloudinaryUrl(url);
      if (c && m.cloud && c.cloudName === m.cloud.cloudName && c.publicId.startsWith(`${m.cloud.folder}/`)) { // only assets this app uploaded
        if (await isReferenced(c.publicId)) continue;
        await m.cloud.destroy(c.publicId);
        await MediaAsset.deleteOne({ provider: "cloudinary", publicId: c.publicId });
        continue;
      }
      const l = parseLocalUploadUrl(url);
      if (l) {
        if (await isReferenced(l.name)) continue;
        await m.local.remove(l.name);
        await MediaAsset.deleteOne({ provider: "local", publicId: l.name });
      }
      // anything else (legacy /assets paths, other hosts) is never touched
    } catch (e) {
      console.error("[media] could not release an unused image:", e?.message || "unknown error");
    }
  }
}

// Every image URL stored on a product / category document (for "what did this change drop?" comparisons).
export const productImageUrls = (p) => [p?.frontImage, p?.backImage, ...(p?.galleryImages || []), ...(p?.variants || []).flatMap((v) => v.images || [])].filter(Boolean);
