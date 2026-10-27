import { Session } from "../models/Session.js";
import { User } from "../models/User.js";
import { parseCookies, serializeCookie } from "../lib/cookies.js";
import { SESSION_COOKIE, hashToken } from "../lib/session.js";
import { ApiError } from "../utils/ApiError.js";
import { isStaff, hasPermission, hasAnyPermission } from "../lib/permissions.js";

export const clearSessionCookie = (res, secure) => res.append("Set-Cookie", serializeCookie(SESSION_COOKIE, "", { maxAgeMs: 0, secure }));

// Resolves req.user from the session cookie (or leaves it null). An unknown/expired cookie is cleared.
export const optionalAuth = (isProd) => async (req, res, next) => {
  req.user = null;
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return next();
  try {
    const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }).lean();
    const user = session ? await User.findById(session.user) : null; // passwordHash is select:false
    // A deactivated account is treated as signed out immediately (its sessions are also removed).
    if (user && user.active !== false) { req.user = user; req.sessionTokenHash = session.tokenHash; }
    else clearSessionCookie(res, isProd);
    next();
  } catch (e) {
    next(e);
  }
};

export const requireAuth = (req, _res, next) =>
  req.user ? next() : next(new ApiError(401, "UNAUTHENTICATED", "Please sign in to continue."));

// Kept for simple role checks. Admin routes use requireStaff + requirePermission below.
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new ApiError(401, "UNAUTHENTICATED", "Please sign in to continue."));
  return roles.includes(req.user.role) ? next() : next(new ApiError(403, "FORBIDDEN", "You do not have access to this resource."));
};

// Any active admin-side account (master or sub-admin). Customers get 403, anonymous visitors 401.
export const requireStaff = (req, _res, next) => {
  if (!req.user) return next(new ApiError(401, "UNAUTHENTICATED", "Please sign in to continue."));
  return isStaff(req.user) ? next() : next(new ApiError(403, "FORBIDDEN", "You do not have access to this resource."));
};

// Checked against the user's CURRENT database record on every request, so revoking a permission applies immediately.
export const requirePermission = (perm) => (req, _res, next) =>
  hasPermission(req.user, perm) ? next() : next(new ApiError(req.user ? 403 : 401, req.user ? "FORBIDDEN" : "UNAUTHENTICATED", req.user ? "You do not have permission to do this." : "Please sign in to continue."));
export const requireAnyPermission = (...perms) => (req, _res, next) =>
  hasAnyPermission(req.user, perms) ? next() : next(new ApiError(req.user ? 403 : 401, req.user ? "FORBIDDEN" : "UNAUTHENTICATED", req.user ? "You do not have permission to do this." : "Please sign in to continue."));

// CSRF defence in depth on top of SameSite=Lax: state-changing requests that carry an Origin header
// (all browser requests do) must come from an allowed frontend origin.
// strict: a missing Origin is rejected too (used for the admin API, which is only ever called from a browser).
export const requireSameOrigin = (allowed, { strict = false } = {}) => (req, _res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.headers.origin;
  if ((strict && !origin) || (origin && !allowed.includes(origin))) return next(new ApiError(403, "BAD_ORIGIN", "Request origin not allowed."));
  next();
};
