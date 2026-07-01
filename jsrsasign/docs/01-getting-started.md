# 01 — Getting Started with jsrsasign in CEngine2d

## Your runtime

```
Android APK
    │
    ▼
CEngine2d 1.5
    │
    ▼
SpiderMonkey JavaScript
    │
    ▼
Your Biz Scripts
```

What you **do not** have:

- Node.js, npm, CommonJS, ES modules
- Browser DOM, `window.crypto`, WebCrypto
- `fetch()`, `require()` (unless your build provides it)

Everything must be **pure JavaScript** loaded by the engine:

```javascript
// Typical CEngine2d 1.5 pattern (adjust to your project)
require("src/crypto/cengine-bootstrap.js");   // mandatory on CEngine2d
require("src/crypto/jsrsasign-all-min.js");
require("src/crypto/CryptoManager.js");
require("src/crypto/IdentityManager.js");
```

Or with `js.include()` if that is what your build uses.

---

## Step 1 — Add the library file

Use the all-in-one bundle (already in this repo):

```
jsrsasign/jsrsasign-all-min.js   (~350 KB minified)
```

Copy it to your project, for example:

```
src/crypto/jsrsasign-all-min.js
```

This single file includes RSA, ECDSA, SHA, HMAC, PEM/DER, KEYUTIL, and more. No other dependencies.

---

## Step 2 — Verify the library loaded

In any view `onEnter` or a bootstrap script:

```javascript
function checkCryptoLoaded() {
  if (typeof KEYUTIL === "undefined") {
    cc.log("ERROR: jsrsasign not loaded");
    return false;
  }
  if (typeof KJUR === "undefined" || !KJUR.crypto) {
    cc.log("ERROR: KJUR.crypto missing");
    return false;
  }
  cc.log("jsrsasign OK");
  return true;
}
```

---

## Step 3 — First hash (SHA-256)

```javascript
var md = new KJUR.crypto.MessageDigest({ alg: "sha256" });
var hashHex = md.digestString("hello world");
// => "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
```

Via the facade (recommended for biz code):

```javascript
CryptoManager.initialize();
var hashHex = CryptoManager.sha256("hello world");
```

---

## Step 4 — Generate an EC P-384 key pair

ECC384 = `secp384r1` = NIST P-384. Good default for user identity keys (smaller than RSA, strong security).

```javascript
CryptoManager.initialize();
CryptoManager.seedFromEnvironment(); // mix entropy before keygen

var kp = CryptoManager.generateECC("secp384r1");
cc.log("public hex: " + kp.pubHex.substring(0, 40) + "...");
cc.log("private hex: " + kp.privHex.substring(0, 40) + "...");
```

---

## Step 5 — Sign and verify a message

```javascript
CryptoManager.initialize();
CryptoManager.seedFromEnvironment();

var kp = CryptoManager.generateECC("secp384r1");
var message = "user moved to (10, 20)";

var sigHex = CryptoManager.signECC(message, kp, "SHA384withECDSA");
var ok = CryptoManager.verifyECC(message, sigHex, kp, "SHA384withECDSA");

cc.log("signature valid: " + ok); // true
cc.log("tampered rejected: " +
  CryptoManager.verifyECC("hacked", sigHex, kp, "SHA384withECDSA")); // false
```

---

## Step 6 — Load keys from PEM (server public key)

If your server ships a PEM public key:

```javascript
var serverPubPem =
  "-----BEGIN PUBLIC KEY-----\n" +
  "...\n" +
  "-----END PUBLIC KEY-----";

var pubKey = CryptoManager.loadPublicKey(serverPubPem);
var valid = CryptoManager.verifyRSA(configJson, signatureHex, pubKey, "SHA256withRSA");
```

---

## Project layout (recommended)

```
src/
  crypto/
    jsrsasign-all-min.js    ← vendor library (do not edit)
    CryptoManager.js        ← your facade (copy from docs/examples/)
    IdentityManager.js      ← auth layer (copy from docs/examples/)
  biz/
    ...                     ← never import jsrsasign here
```

Biz modules call `CryptoManager` / `IdentityManager` only.

---

## Before generating keys in production

1. **Seed randomness** — call `CryptoManager.seedFromEnvironment()` (and ideally mix server nonce or native entropy) **before the first** `generateRSA` / `generateECC`. This mixes bytes into jsrsasign's global `rng_seed_int` pool.
2. **Never log private keys** — debug-print prefixes only.
3. **Use signatures for auth** — do not send passwords on every signed request (see [04-auth-flows.md](./04-auth-flows.md)).
4. **Unlock session before signing** — call `IdentityManager.signIn()` before `signUserInput()`; call `IdentityManager.clearSession()` on logout.

---

## Next steps

- [02-jsrsasign-core-api.md](./02-jsrsasign-core-api.md) — raw jsrsasign API reference
- [03-architecture.md](./03-architecture.md) — full layered design
- [examples/CENGINE.md](./examples/CENGINE.md) — exact script load order
- [06-https-networking.md](./06-https-networking.md) — HTTPS via XMLHttpRequest
- Run `node jsrsasign/docs/examples/test-smoke.js` to validate the example code
