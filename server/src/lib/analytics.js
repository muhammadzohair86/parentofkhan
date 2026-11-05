// Visitor counting helpers. Pure (no I/O), unit-tested. Privacy: no IP address, no user agent and no raw identifier is ever stored.
import { createHash } from "node:crypto";

export const STORE_UTC_OFFSET_MIN = 300; // Pakistan (UTC+5, no daylight saving): "today" follows the store's local day

// "2026-11-04" for the store's local day containing `date`
export const dayKey = (date = new Date(), offsetMin = STORE_UTC_OFFSET_MIN) => new Date(date.getTime() + offsetMin * 60_000).toISOString().slice(0, 10);
export const addDays = (key, n) => { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// The random id the browser keeps (a UUID). Anything else is ignored.
export const isVisitorId = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const hashVisitorId = (id) => createHash("sha256").update(`pok-visitor:${id.toLowerCase()}`).digest("hex");

// Obvious crawlers, monitors and headless tools are not visitors. (Best effort: it is a counter, not a security control.)
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|uptime|pingdom|lighthouse|headless|phantomjs|curl\/|wget|python-requests|httpclient|axios|node-fetch|go-http|java\//i;
export const isBot = (ua) => !ua || BOT.test(String(ua));

// rows: [{ _id: "2026-11-04", n: 3 }] -> [{ day, value }] for `days` days ending at `endKey`, missing days as 0
export function fillSeries(rows, endKey, days) {
  const by = new Map(rows.map((r) => [r._id, r.n]));
  return Array.from({ length: days }, (_, i) => { const day = addDays(endKey, i - (days - 1)); return { day, value: by.get(day) || 0 }; });
}
