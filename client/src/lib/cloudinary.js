import { Cloudinary } from "@cloudinary/url-gen";
import { limitFit } from "@cloudinary/url-gen/actions/resize";
import { format, quality } from "@cloudinary/url-gen/actions/delivery";
import { auto as autoFormat } from "@cloudinary/url-gen/qualifiers/format";
import { auto as autoQuality } from "@cloudinary/url-gen/qualifiers/quality";
import { parseCloudinaryUrl } from "./cloudinaryUrl.js";

// The single place where Cloudinary delivery URLs are built, so every image on the site follows the same rules:
//  - f_auto and q_auto are applied as two SEPARATE delivery actions (…/f_auto/q_auto/…)
//  - c_limit with a width only: never upscaled, aspect ratio untouched (no distortion, no cropping)
//  - widths come from small fixed lists, so only a handful of variants can ever exist (good for CDN caching)
// Only plain Cloudinary upload URLs are transformed. Local paths, other hosts and already-transformed URLs pass through.
const WANT_CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || ""; // optional: when set, only this cloud is transformed
const clients = new Map();
const client = (cloudName) => {
  if (!clients.has(cloudName)) clients.set(cloudName, new Cloudinary({ cloud: { cloudName }, url: { secure: true } }));
  return clients.get(cloudName);
};

export function deliveryImage(parsed, width) {
  const img = client(parsed.cloudName).image(parsed.publicId);
  img.resize(limitFit().width(width)).delivery(format(autoFormat())).delivery(quality(autoQuality()));
  return img;
}

const cache = new Map(); // "url|w1,w2" -> result, so the same image is never re-built on every render

// -> null for non-Cloudinary images, otherwise { image, src, srcSet } (image = the base-width CloudinaryImage for <AdvancedImage>)
export function cloudinarySources(url, widths) {
  const key = `${url}|${widths.join(",")}`;
  if (cache.has(key)) return cache.get(key);
  const parsed = parseCloudinaryUrl(url);
  let out = null;
  if (parsed && (!WANT_CLOUD || WANT_CLOUD === parsed.cloudName)) {
    const base = widths[Math.floor(widths.length / 2)];
    const image = deliveryImage(parsed, base);
    out = { image, src: image.toURL(), srcSet: widths.map((w) => `${deliveryImage(parsed, w).toURL()} ${w}w`).join(", ") };
  }
  cache.set(key, out);
  return out;
}
