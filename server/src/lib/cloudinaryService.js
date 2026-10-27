// Thin wrapper around the official Cloudinary Node SDK. The SDK is imported lazily so the server still starts
// (using local storage) on machines where Cloudinary is not configured. The API secret never leaves this process.
export async function createCloudinaryService(cfg) {
  let cloudinary;
  try {
    ({ v2: cloudinary } = await import("cloudinary"));
  } catch {
    throw new Error("Cloudinary is configured but the 'cloudinary' package is not installed. Run `npm install` in server/.");
  }
  cloudinary.config({ cloud_name: cfg.cloudName, api_key: cfg.apiKey, api_secret: cfg.apiSecret, secure: true });

  return {
    provider: "cloudinary",
    cloudName: cfg.cloudName,
    folder: cfg.folder,
    // Signed upload performed by the SDK with the secret. The public ID is derived from the file's hash, so the same
    // image always maps to the same asset. Oversized originals are limited ONCE at upload time (a single stored
    // image, no extra derived copies are created).
    upload(buffer, publicId) {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            public_id: publicId, resource_type: "image", type: "upload", overwrite: false, unique_filename: false, use_filename: false,
            allowed_formats: ["jpg", "png", "webp"],
            transformation: [{ width: cfg.maxDimension, height: cfg.maxDimension, crop: "limit" }],
          },
          (err, result) => (err ? reject(err) : resolve(result))
        );
        stream.end(buffer);
      });
    },
    async destroy(publicId) {
      await cloudinary.uploader.destroy(publicId, { resource_type: "image", type: "upload" });
    },
  };
}
