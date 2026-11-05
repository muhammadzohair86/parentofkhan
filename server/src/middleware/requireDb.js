import { waitForDb } from "../config/db.js";
import { ApiError } from "../utils/ApiError.js";

// Database-backed routes need a ready connection. If it is momentarily down (a reconnect after an idle drop, an Atlas hiccup) the request
// waits a few seconds for it instead of failing at once; only if it is STILL down does the visitor get an honest 503 (with Retry-After).
export const DB_WAIT_MS = 5_000;
export const requireDb = async (_req, res, next) => {
  try {
    if (await waitForDb(DB_WAIT_MS)) return next();
    res.set("Retry-After", "3");
    next(new ApiError(503, "DB_UNAVAILABLE", "The database is temporarily unavailable. Please try again shortly."));
  } catch (e) { next(e); }
};
