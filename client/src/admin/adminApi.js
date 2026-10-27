import { apiGet, apiPost, apiPatch, apiPut, apiDelete, ApiError, API_BASE } from "../services/api.js";
import { useAdminAuth } from "./useAdminAuth.js";

// All admin calls go through here so an expired/revoked session (401) sends the user back to the login screen.
const guard = async (promise) => {
  try { return await promise; }
  catch (e) { if (e instanceof ApiError && e.status === 401) useAdminAuth.getState().expire(); throw e; }
};
export const A = {
  get: (path, params) => guard(apiGet(`/admin${path}`, params)),
  post: (path, body) => guard(apiPost(`/admin${path}`, body)),
  patch: (path, body) => guard(apiPatch(`/admin${path}`, body)),
  put: (path, body) => guard(apiPut(`/admin${path}`, body)),
  del: (path, params) => guard(apiDelete(`/admin${path}`, params)),
};

export const MAX_UPLOAD = 5 * 1024 * 1024; // fallback; the real limit comes from the server (UPLOAD_MAX_MB)
let uploadConfig = null;
// { provider: "cloudinary" | "local", maxBytes }. Fetched once.
export function getUploadConfig() {
  uploadConfig ??= A.get("/uploads/config").then((r) => r.data).catch(() => { uploadConfig = null; return { provider: "local", maxBytes: MAX_UPLOAD }; });
  return uploadConfig;
}
export const formatMB = (bytes) => `${Math.round((bytes / 1048576) * 10) / 10} MB`;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Uploads one image (raw bytes as the request body) with progress. Resolves to the stored image URL.
export async function uploadImage(file, onProgress) {
  const { maxBytes } = await getUploadConfig();
  return new Promise((resolve, reject) => {
    if (!IMAGE_TYPES.includes(file.type)) return reject(new ApiError("Use a JPEG, PNG or WebP image."));
    if (file.size > maxBytes) return reject(new ApiError(`That image is larger than ${formatMB(maxBytes)}.`));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/admin/uploads`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
    xhr.onerror = () => reject(new ApiError("Upload failed. Check your connection and try again."));
    xhr.onload = () => {
      let json = null;
      try { json = JSON.parse(xhr.responseText); } catch { /* non-JSON */ }
      if (xhr.status === 401) useAdminAuth.getState().expire();
      if (xhr.status >= 200 && xhr.status < 300 && json?.success) return resolve(json.data.url);
      reject(new ApiError(json?.error?.message || "Upload failed.", { status: xhr.status }));
    };
    xhr.send(file);
  });
}
