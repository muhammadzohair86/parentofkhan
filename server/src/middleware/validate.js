import { ApiError } from "../utils/ApiError.js";

// validate({ params, query, body }) parses with zod and exposes clean values on req.validated.
export const validate = (schemas) => (req, _res, next) => {
  const validated = {};
  for (const key of ["params", "query", "body"]) {
    if (!schemas[key]) continue;
    const result = schemas[key].safeParse(req[key] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
      return next(new ApiError(400, "VALIDATION_ERROR", key === "body" ? "Please check the highlighted fields." : "Invalid request parameters.", details));
    }
    validated[key] = result.data;
  }
  req.validated = validated;
  next();
};
