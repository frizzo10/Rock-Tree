// The server's dice. The engine reads Math.random when it loads, so this file must load first.
// Normally it is a cryptographically strong source, so nobody can predict or steer a roll.
// A league game is instead played from a secret seed. The seed's SHA-256 fingerprint is published before the game,
// and the seed itself after it, so anyone can replay the game and check every roll (see audit.html).
const buf = new Uint32Array(2); let seeded = null;
const strong = () => { globalThis.crypto.getRandomValues(buf); return (buf[0] * 2097152 + (buf[1] >>> 11)) / 9007199254740992; };
// sfc32: a small, well-tested generator that gives the same numbers in every browser and on the server
function sfc32(a, b, c, d) { return () => { a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0; return t >>> 0; }; }
function fromSeed(hex) {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('A seed is 64 hexadecimal characters.');
  const w = []; for (let i = 0; i < 8; i++) w.push(parseInt(hex.slice(i * 8, i * 8 + 8), 16) >>> 0);
  const next = sfc32(w[0] ^ w[4], w[1] ^ w[5], w[2] ^ w[6], w[3] ^ w[7]); for (let i = 0; i < 20; i++) next();   // warm up
  return () => { const hi = next() >>> 5, lo = next() >>> 6; return (hi * 67108864 + lo) / 9007199254740992; };   // 53 random bits
}
Math.random = function () { return seeded ? seeded() : strong(); };
Math.random.seed = function (hex) { seeded = hex == null ? null : fromSeed(hex); };   // pass a seed to replay a game; pass nothing to go back to the strong source
