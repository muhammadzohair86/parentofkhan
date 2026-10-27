import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { runSafepayCheck } from "../lib/safepayCheck.js";

// npm run check:safepay        -> checks the configuration only (no network)
// npm run check:safepay:live   -> also creates one unpaid US$10.00 session in Safepay's SANDBOX to prove the credentials and endpoints work
// Prints variable NAMES and statuses only, never a key or secret.
const cwd = process.cwd();
const { ok, lines } = await runSafepayCheck({ env: process.env, cwd, envFileFound: fs.existsSync(path.join(cwd, ".env")), live: process.argv.includes("--live") });
console.log(lines.join("\n"));
process.exit(ok ? 0 : 1);
