import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/lib/password.js";
import { newToken, hashToken } from "../src/lib/session.js";
import { parseCookies, serializeCookie } from "../src/lib/cookies.js";

test("passwords are hashed with scrypt, salted, and verify correctly", async () => {
  const h1 = await hashPassword("correct horse battery");
  const h2 = await hashPassword("correct horse battery");
  assert.ok(h1.startsWith("scrypt$"));
  assert.ok(!h1.includes("correct horse"));
  assert.notEqual(h1, h2); // random salt
  assert.equal(await verifyPassword("correct horse battery", h1), true);
  assert.equal(await verifyPassword("wrong password", h1), false);
});

test("verifyPassword rejects malformed or foreign hashes instead of throwing", async () => {
  assert.equal(await verifyPassword("x", "plaintext"), false);
  assert.equal(await verifyPassword("x", "bcrypt$1$2$3$a$b"), false);
  assert.equal(await verifyPassword("x", undefined), false);
});

test("session tokens are random, and only their hash is stored", () => {
  const a = newToken(), b = newToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 43);
  assert.notEqual(hashToken(a), a);
  assert.equal(hashToken(a), hashToken(a));
});

test("cookie is HttpOnly + SameSite, Secure only in production", () => {
  const dev = serializeCookie("pok_session", "tok", { maxAgeMs: 60_000, secure: false });
  assert.match(dev, /HttpOnly/); assert.match(dev, /SameSite=Lax/); assert.match(dev, /Max-Age=60/);
  assert.doesNotMatch(dev, /Secure/);
  assert.match(serializeCookie("pok_session", "tok", { maxAgeMs: 60_000, secure: true }), /; Secure/);
  assert.match(serializeCookie("pok_session", "", { maxAgeMs: 0, secure: false }), /Max-Age=0/);
});

test("cookie parsing", () => {
  assert.deepEqual(parseCookies("a=1; pok_session=abc%20d; b=%E0%A4%A"), { a: "1", pok_session: "abc d" });
  assert.deepEqual(parseCookies(undefined), {});
});
