// CSV helpers. A cell that starts with = + - @ (or a tab/CR) would be run as a formula by Excel/Sheets,
// so it is prefixed with an apostrophe. Quotes, commas and newlines are escaped per RFC 4180.
export function csvCell(value) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const csvLine = (cells) => `${cells.map(csvCell).join(",")}\r\n`;
