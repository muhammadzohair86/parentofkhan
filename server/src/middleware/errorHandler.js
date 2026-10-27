import { ApiError } from "../utils/ApiError.js";
import { redact } from "../config/db.js";

export const notFound = (req, _res, next) => next(new ApiError(404, "NOT_FOUND", `Route not found: ${req.method} ${req.path}`));

// eslint-disable-next-line no-unused-vars
export const errorHandler = (isProd) => (err, _req, res, _next) => {
  let status = err.status || 500;
  let code = err.code && typeof err.code === "string" ? err.code : "INTERNAL_ERROR";
  let message = err.message;

  if (err.name === "CastError" || err.name === "ValidationError") { status = 400; code = "VALIDATION_ERROR"; }
  if (err.type === "entity.too.large") { status = 413; code = "PAYLOAD_TOO_LARGE"; }
  if (err.type === "entity.parse.failed") { status = 400; code = "BAD_JSON"; message = "Malformed JSON body."; }
  if (!(err instanceof ApiError) && status >= 500) {
    console.error("[error]", redact(err.stack || err.message));
    code = "INTERNAL_ERROR";
    message = "Something went wrong on our side.";
  }
  if (!isProd && status >= 500 && err.message) message = redact(err.message); // dev only; never include stacks in responses

  res.status(status).json({ success: false, error: { code, message, ...(err.details ? { details: err.details } : {}) } });
};
