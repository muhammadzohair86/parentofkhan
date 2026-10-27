import { mkdir, writeFile, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";

// Local-disk image storage. Files are named by the server (random hex + a sniffed extension), so a client can
// never choose a path or overwrite anything. The stored reference is "/api/uploads/<name>" (or an absolute URL
// when PUBLIC_UPLOAD_BASE_URL is set). NOTE: many hosts wipe the local disk on every deploy; see README.
export function createStorage({ dir, publicBase }) {
  const root = path.resolve(dir);
  return {
    root,
    async save(buffer, ext) {
      await mkdir(root, { recursive: true });
      const name = `${randomBytes(16).toString("hex")}.${ext}`;
      await writeFile(path.join(root, name), buffer, { flag: "wx" });
      return { name, url: `${publicBase || ""}/api/uploads/${name}` };
    },
    async remove(name) {
      if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) return false; // only files this storage created
      await unlink(path.join(root, name)).catch(() => {});
      return true;
    },
  };
}
