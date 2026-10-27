import { isDbReady } from "../config/db.js";
import { ApiError } from "../utils/ApiError.js";

// Refuse database-backed routes while the connection is not ready.
export const requireDb = (_req, _res, next) =>
  isDbReady() ? next() : next(new ApiError(503, "DB_UNAVAILABLE", "The database is temporarily unavailable. Please try again shortly."));
