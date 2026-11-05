import mongoose from "mongoose";
import { waitForDb as waitFor, isTransientDbError } from "../lib/dbReadiness.js";

export { isTransientDbError };
export const waitForDb = (timeoutMs) => waitFor(timeoutMs, { ready: isDbReady });

// Strip credentials from anything that might contain a connection string.
export const redact = (msg) => String(msg).replace(/(mongodb(?:\+srv)?:\/\/)[^@\s/]+@/gi, "$1***@");

export const isDbReady = () => mongoose.connection.readyState === 1;

// Pooled sockets that sit idle are the usual victims of NAT / load-balancer / Atlas idle timeouts: the first query after a quiet period
// then fails on a dead socket. Closing idle sockets ourselves (maxIdleTimeMS) and keeping the monitor heartbeat short makes the driver
// notice and replace them BEFORE a customer's request needs them.
export const CONNECT_OPTIONS = Object.freeze({
  serverSelectionTimeoutMS: 10_000,
  connectTimeoutMS: 10_000,
  socketTimeoutMS: 45_000,
  heartbeatFrequencyMS: 10_000,
  maxPoolSize: 10,
  maxIdleTimeMS: 60_000,
});

let listenersAttached = false;
function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  mongoose.connection.on("disconnected", () => console.warn("[db] disconnected (the driver reconnects automatically; requests wait briefly for it)"));
  mongoose.connection.on("reconnected", () => console.log("[db] reconnected"));
  mongoose.connection.on("error", (e) => console.error("[db] error:", redact(e.message)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One connection attempt. Errors are redacted so a connection string can never reach a log.
async function connectOnce(uri) {
  try {
    await mongoose.connect(uri, CONNECT_OPTIONS);
  } catch (err) {
    const e = new Error(redact(err.message));
    e.name = "DatabaseConnectionError";
    throw e;
  }
}

// Connects once, or retries a few times with growing delays. A single failed first attempt (Atlas still waking, DNS hiccup, the host's
// network not up yet) used to terminate the process, which the host then restarted from cold: that is exactly the window in which visitors saw errors.
export async function connectDB(uri, { attempts = 5, baseDelayMs = 1500, log = console } = {}) {
  mongoose.set("strictQuery", true);
  attachListeners();
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      await connectOnce(uri);
      log.log(`[db] connected to database "${mongoose.connection.name}"`);
      return;
    } catch (e) {
      lastErr = e;
      if (i < attempts) {
        const wait = Math.min(baseDelayMs * 2 ** (i - 1), 15_000);
        log.warn(`[db] connection attempt ${i}/${attempts} failed: ${e.message}. Retrying in ${Math.round(wait / 1000)}s...`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
