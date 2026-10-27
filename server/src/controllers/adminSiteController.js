import { SiteSetting } from "../models/SiteSetting.js";
import { releaseImages } from "../lib/media.js";
import { DEFAULT_HERO_ALT } from "../lib/siteDefaults.js";

const shape = (doc) => ({
  desktopImage: doc?.hero?.desktopImage || null, mobileImage: doc?.hero?.mobileImage || null,
  alt: doc?.hero?.alt || "", active: doc?.hero ? doc.hero.active !== false : true,
  defaultAlt: DEFAULT_HERO_ALT, updatedAt: doc?.updatedAt || null,
});

export async function getHeroSettings(_req, res) {
  const doc = await SiteSetting.findOne({ key: "site" }).lean();
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: shape(doc) });
}

export async function updateHeroSettings(req, res) {
  const d = req.validated.body;
  const before = await SiteSetting.findOne({ key: "site" }).lean();
  const update = { $set: { "hero.desktopImage": d.desktopImage ?? null, "hero.mobileImage": d.mobileImage ?? null, "hero.alt": d.alt, "hero.active": d.active } };
  const opts = { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true };
  let doc;
  try {
    doc = await SiteSetting.findOneAndUpdate({ key: "site" }, update, opts).lean(); // single settings document (unique key)
  } catch (e) {
    if (e?.code !== 11000) throw e;
    doc = await SiteSetting.findOneAndUpdate({ key: "site" }, update, opts).lean(); // two first-time saves raced: the second just updates
  }
  await releaseImages([before?.hero?.desktopImage, before?.hero?.mobileImage]); // replaced images are deleted only if unused elsewhere
  res.json({ success: true, data: shape(doc) });
}
