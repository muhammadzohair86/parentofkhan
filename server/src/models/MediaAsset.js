import mongoose from "mongoose";

// One record per stored image file. `hash` (SHA-256 of the uploaded bytes) is how identical uploads are
// recognised and reused instead of being stored (and billed) twice.
const mediaAssetSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ["cloudinary", "local"], required: true },
    hash: { type: String, required: true },
    publicId: { type: String, required: true }, // Cloudinary public ID, or the local file name
    url: { type: String, required: true }, // secure delivery URL (what product/category/hero fields store)
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    bytes: { type: Number, default: null },
    format: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

mediaAssetSchema.index({ provider: 1, hash: 1 }, { unique: true });
mediaAssetSchema.index({ provider: 1, publicId: 1 }, { unique: true });

export const MediaAsset = mongoose.models.MediaAsset || mongoose.model("MediaAsset", mediaAssetSchema);
