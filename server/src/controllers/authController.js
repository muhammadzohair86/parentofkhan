import { User } from "../models/User.js";
import { Session } from "../models/Session.js";
import { hashPassword, verifyPassword, dummyHash } from "../lib/password.js";
import { SESSION_COOKIE, SESSION_TTL_MS, newToken, hashToken } from "../lib/session.js";
import { serializeCookie } from "../lib/cookies.js";
import { clearSessionCookie } from "../middleware/auth.js";
import { ApiError } from "../utils/ApiError.js";

// Public user shape. Never includes the password hash.
export const serializeUser = (u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role });

export async function startSession(res, user, isProd, ttlMs = SESSION_TTL_MS) {
  const token = newToken();
  await Session.create({ tokenHash: hashToken(token), user: user._id, expiresAt: new Date(Date.now() + ttlMs) });
  res.append("Set-Cookie", serializeCookie(SESSION_COOKIE, token, { maxAgeMs: ttlMs, secure: isProd }));
}

export const signup = (isProd) => async (req, res) => {
  const { name, email, password } = req.validated.body;
  if (await User.exists({ email })) throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists. Try signing in.");
  let user;
  try {
    // role is never read from the request: new accounts always get the schema default ("customer").
    user = await User.create({ name, email, passwordHash: await hashPassword(password) });
  } catch (e) {
    if (e?.code === 11000) throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists. Try signing in.");
    throw e;
  }
  await startSession(res, user, isProd);
  res.status(201).json({ success: true, data: serializeUser(user) });
};

export const login = (isProd) => async (req, res) => {
  const { email, password } = req.validated.body;
  const user = await User.findOne({ email }).select("+passwordHash");
  // Same work and same message whether the email is unknown or the password is wrong.
  const ok = await verifyPassword(password, user ? user.passwordHash : await dummyHash());
  if (!user || !ok || user.active === false) throw new ApiError(401, "INVALID_CREDENTIALS", "Incorrect email or password.");
  user.lastLoginAt = new Date();
  await user.save();
  await startSession(res, user, isProd);
  res.json({ success: true, data: serializeUser(user) });
};

export const logout = (isProd) => async (req, res) => {
  if (req.sessionTokenHash) await Session.deleteOne({ tokenHash: req.sessionTokenHash });
  clearSessionCookie(res, isProd);
  res.json({ success: true, data: null });
};

// Anonymous visitors get 200 with data: null (so the storefront can check without an error in the console).
export const me = (req, res) => res.json({ success: true, data: req.user ? serializeUser(req.user) : null });
