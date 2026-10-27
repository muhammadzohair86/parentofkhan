import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

// scrypt from Node's standard library (no native add-on to compile). Parameters follow the OWASP
// password-storage guidance (N=2^15, r=8, p=3 is one of its equivalent scrypt configurations).
// The parameters are stored inside every hash, so they can be raised later and old hashes still verify.
const PARAMS = { N: 2 ** 15, r: 8, p: 3 };
const KEYLEN = 64;
const maxmem = (N, r, p) => 128 * N * r * (p + 2); // headroom above scrypt's working set

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const { N, r, p } = PARAMS;
  const key = await scryptAsync(password.normalize("NFKC"), salt, KEYLEN, { N, r, p, maxmem: maxmem(N, r, p) });
  return ["scrypt", N, r, p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, saltB64, keyB64] = String(stored).split("$");
    if (alg !== "scrypt") return false;
    const n = Number(N), rr = Number(r), pp = Number(p);
    const expected = Buffer.from(keyB64, "base64");
    const key = await scryptAsync(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, { N: n, r: rr, p: pp, maxmem: maxmem(n, rr, pp) });
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// A real hash of a random value, used so "unknown email" costs the same time as "wrong password".
let dummy;
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(12).toString("hex")));
