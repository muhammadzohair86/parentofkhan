// Pure helpers about database readiness and transient driver errors (no driver import, so they are unit-tested without MongoDB).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resolves true as soon as the connection is ready, false if it is still not ready after `timeoutMs`. A brief reconnect (a few hundred ms to a
// few seconds) is therefore absorbed here instead of being shown to the visitor as an outage.
export async function waitForDb(timeoutMs = 5_000, { ready, pollMs = 100 } = {}) {
  if (ready()) return true;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(Math.min(pollMs, Math.max(0, deadline - Date.now())));
    if (ready()) return true;
  }
  return ready();
}

// Errors that mean "the database could not be reached right now" (as opposed to a bug or bad input). Checked by name so no driver import is needed.
const TRANSIENT_NAMES = new Set([
  "MongoNetworkError", "MongoNetworkTimeoutError", "MongoServerSelectionError", "MongoTopologyClosedError",
  "MongoPoolClearedError", "PoolClearedError", "MongoPoolClosedError", "PoolClosedError", "MongoNotConnectedError", "DatabaseConnectionError",
]);
export function isTransientDbError(err) {
  if (!err) return false;
  if (TRANSIENT_NAMES.has(err.name) || TRANSIENT_NAMES.has(err.constructor?.name)) return true;
  if (err.name === "MongooseError" && /buffering timed out/i.test(String(err.message))) return true;
  if (err.name === "MongoServerError" && [91, 11600, 11602, 13435, 13436].includes(err.code)) return true; // shutdown in progress / interrupted / not primary
  return false;
}

