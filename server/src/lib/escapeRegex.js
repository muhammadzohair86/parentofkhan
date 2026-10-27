// Escape user input before putting it into a RegExp (prevents regex injection / ReDoS patterns).
export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
