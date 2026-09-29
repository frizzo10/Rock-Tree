// The server's dice. The engine reads Math.random when it loads, so this file must load first.
// It swaps in a cryptographically strong source, so nobody can predict or steer a roll.
const buf = new Uint32Array(2);
Math.random = function () { globalThis.crypto.getRandomValues(buf); return (buf[0] * 2097152 + (buf[1] >>> 11)) / 9007199254740992; };
