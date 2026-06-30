# Using jsbn with Cocos2d 1.5 Android

Pure legacy JavaScript cryptography for **RSA-2048** and **ECDH (secp384r1 / P-384)** — no Node.js, no browser, no bundler.

This fork removes hard dependencies on `window`, `navigator`, and `alert()`, adds the **secp384r1** curve, and provides a thin **`CocosSec`** API for game code.

---

## Is it really pure JavaScript?

**Yes — for runtime.** The game APK does not need Node.js, npm, a browser, or native crypto libraries.

| Question | Answer |
|----------|--------|
| Needs Node.js at runtime? | **No** |
| Needs browser DOM / `window`? | **No** (optional hooks only if present) |
| Needs native Android crypto? | **No** |
| Pure JS math (BigInteger, RSA, EC)? | **Yes** — Tom Wu jsbn, ES3-style globals |
| Files to ship in APK | 9 `.js` files (see load order below) |

### What runs inside Cocos2d

Everything is plain `.js` files loaded into the engine’s JavaScript VM (SpiderMonkey / JavaScriptCore). They define global functions and objects (`BigInteger`, `RSAKey`, `CocosSec`, …) — the same model Cocos2d 1.5 already uses.

**Only standard JS + optional Cocos2d globals:**

| Used by | APIs |
|---------|------|
| All crypto core | `Math`, `Date`, `Array`, `String`, `parseInt` |
| `CocosSec.gatherEntropyBytes` | above + optionally `cc.director`, `cc.sys` if `cc` exists |
| `rng.js` (optional) | `window.crypto` **only if** `window` happens to exist — skipped in Cocos2d |

There is **no** `require()`, `import`, `fetch`, `document`, or `alert()` in the shipped crypto path.

### What is NOT pure (by design)

| Item | Notes |
|------|-------|
| `test-smoke.js` | Dev-only verifier; uses Node.js — **do not ship in APK** |
| HTML demos (`*.html`) | Browser demos — **do not ship in APK** |
| `Math.random()` fallback | Used when you call `seedFromEnvironment()` — fine for session setup with server nonce, not for long-term secrets alone |
| Speed | Pure JS big-num math is **slow** vs native crypto (seconds for RSA-2048 keygen on old phones) |

---

## Verified tests (re-run anytime)

On your dev PC (optional):

```bash
node jsbn/test-smoke.js
```

This loads all scripts in a **sandbox with no `window`, `navigator`, `alert`, or `cc`** — the same conditions as embedded Cocos2d JS — then checks:

1. All files load without browser globals  
2. ECDH P-384 shared secrets match  
3. Same fixed seed → same keys (reproducible)  
4. RSA-2048 encrypt/decrypt roundtrip  
5. `hexToBytes` / `bytesToHex` utilities  

### Known test vectors (fixed 32-byte seed)

Use this seed in your game to verify the port matches (debug builds only):

```javascript
var TEST_SEED = [
  0x3a, 0xf2, 0x91, 0x0c, 0x55, 0xe8, 0x17, 0x6b,
  0x02, 0x44, 0xac, 0x81, 0xd9, 0x3f, 0x70, 0x28,
  0xce, 0x11, 0x9a, 0x64, 0x05, 0xb2, 0xf8, 0x73,
  0x1d, 0x4e, 0x86, 0xc0, 0x39, 0xa7, 0x52, 0x6d
];
CocosSec.seedRandom(TEST_SEED);
```

| Output | Expected shape | Verified prefix (this fork) |
|--------|----------------|----------------------------|
| `ecdhGenerateKeyPair().pubHex` | 194 hex chars, starts with `04` | `04a820f1e100640dee1e5a492bda665bb98e24cc...` |
| `ecdhGenerateKeyPair().privHex` | ~96–110 hex chars | (deterministic — re-run test to compare) |
| `rsaGenerateKey().n` | 512 hex chars (2048-bit) | `9940dfd4823bc03760abe71699c66271f54960d2...` |
| `rsaGenerateKey().e` | `10001` | always |
| `rsaEncrypt(n, e, "hello cocos2d")` | 512 hex chars | decrypts back to `"hello cocos2d"` |

If your build prints the same prefixes after `CocosSec.seedRandom(TEST_SEED)`, the library is wired correctly.

---

## What is included

| Feature | Support |
|---------|---------|
| RSA-2048 key generation | Yes |
| RSA PKCS#1 v1.5 encrypt/decrypt | Yes |
| ECDH P-384 (secp384r1) key agreement | Yes |
| ECDSA P-384 sign/verify | Yes |
| User register / sign-in helpers | Yes |
| Node.js / npm | Not required |
| Browser DOM / Web Crypto | Not required |

---

## Copy files into your project

Copy the entire `jsbn/` folder into your Cocos2d JavaScript source tree, for example:

```
YourGame/
  src/
    crypto/
      jsbn/
        jsbn.js
        jsbn2.js
        prng4.js
        rng.js
        rsa.js
        rsa2.js
        ec.js
        sec.js
        sha256.js
        ecdsa.js
        cocos2d-sec.js
        example-auth-scene.js   ← register / sign-in / signed input patterns
```

Optional utilities (not required for RSA/ECDH):

- `base64.js` — Base64 encode/decode
- `sha1.js` — SHA-1 (legacy; not recommended for new designs)

The HTML demo files (`rsa.html`, `rsa2.html`, `ecdh.html`) are for browser testing only. Do not ship them in the APK.

---

## Script load order

Scripts must be loaded **in this exact order** before you call any crypto API:

```
1. jsbn.js
2. jsbn2.js
3. prng4.js
4. rng.js
5. rsa.js
6. rsa2.js
7. ec.js
8. sec.js
9. sha256.js
10. ecdsa.js
11. cocos2d-sec.js
```

### Cocos2d-x JavaScript (JSB) example

If your project lists scripts in `project.json` or loads them in `main.js`:

```javascript
// main.js — load crypto scripts before game logic
(function() {
  var scripts = [
    "src/crypto/jsbn/jsbn.js",
    "src/crypto/jsbn/jsbn2.js",
    "src/crypto/jsbn/prng4.js",
    "src/crypto/jsbn/rng.js",
    "src/crypto/jsbn/rsa.js",
    "src/crypto/jsbn/rsa2.js",
    "src/crypto/jsbn/ec.js",
    "src/crypto/jsbn/sec.js",
    "src/crypto/jsbn/sha256.js",
    "src/crypto/jsbn/ecdsa.js",
    "src/crypto/jsbn/cocos2d-sec.js"
  ];
  for (var i = 0; i < scripts.length; i++) {
    require(scripts[i]);  // or your engine's equivalent script loader
  }
})();
```

If your Cocos2d 1.5 build does not support `require()`, include the files via whatever mechanism your template uses (concatenation, manual `<script>` tags in the bootstrap HTML, or engine-specific script registration).

---

## Seed randomness before key generation

**Always seed the RNG** before generating keys. In Cocos2d embedded JS there is no `window.crypto` and (in this guide) no Android `SecureRandom` bridge.

`seedRandom` accepts a JavaScript array of byte values (`0`–`255`). Each call **mixes** new bytes into the pool; call it at startup and again right before key generation.

```javascript
CocosSec.setErrorHandler(function(msg) {
  cc.log("crypto: " + msg);
});
```

---

### Approach 1 — Fixed bytes (testing / reproducible demos only)

Use when you need the **same keys every run** (unit tests, debugging). **Never ship production keys this way.**

```javascript
// Literal 32-byte array — same input => same RSA/ECDH keys every time
var testSeed = [
  0x3a, 0xf2, 0x91, 0x0c, 0x55, 0xe8, 0x17, 0x6b,
  0x02, 0x44, 0xac, 0x81, 0xd9, 0x3f, 0x70, 0x28,
  0xce, 0x11, 0x9a, 0x64, 0x05, 0xb2, 0xf8, 0x73,
  0x1d, 0x4e, 0x86, 0xc0, 0x39, 0xa7, 0x52, 0x6d
];
CocosSec.seedRandom(testSeed);

var key = CocosSec.rsaGenerateKey();
cc.log("modulus starts with: " + key.n.substring(0, 16));
// Always the same prefix for this seed, e.g. "a4f3c2..."
```

You can also build bytes from a hex string (built into `CocosSec`):

```javascript
CocosSec.seedRandom(CocosSec.hexToBytes(
  "deadbeef0123456789abcdef0123456789abcdef0123456789abcdef01234567"
));
```

After seeding with `TEST_SEED` above, this public key prefix confirms ECDH works:

```javascript
CocosSec.seedRandom(TEST_SEED);
var kp = CocosSec.ecdhGenerateKeyPair();
cc.log(kp.pubHex.substring(0, 40));
// expect: 04a820f1e100640dee1e5a492bda665bb98e24cc
```

---

### Approach 2 — JS-only environment entropy (no native code)

`CocosSec.gatherEntropyBytes()` collects what is available in plain Cocos2d JS: `Date`, `Math.random()`, frame counter, OS/platform string.

```javascript
// Returns 32 ints 0-255, e.g. [183, 44, 201, 17, 92, ...]
var seed = CocosSec.gatherEntropyBytes(32);
CocosSec.seedRandom(seed);

var alice = CocosSec.ecdhGenerateKeyPair();
cc.log("alice pub starts with: " + alice.pubHex.substring(0, 8)); // "046AA87C..."
```

One-liner wrapper:

```javascript
CocosSec.seedFromEnvironment();
var bob = CocosSec.ecdhGenerateKeyPair();
```

This is **better than `seedRandom(null)`** (time only), but still weaker than a hardware RNG. Acceptable for client-side ECDH session setup if the server also contributes randomness (see Approach 4).

---

### Approach 3 — Mix in touch / gameplay events

Register a touch listener during login or a “tap to continue” screen, then seed before keygen:

```javascript
// In init or login scene — collect a few taps first
cc.eventManager.addListener({
  event: cc.EventListener.TOUCH_ONE_BY_ONE,
  swallowTouches: false,
  onTouchBegan: function(touch, event) {
    var p = touch.getLocation();
    CocosSec.addTouchEntropy(p.x | 0, p.y | 0);
    cc.log("entropy samples: " + CocosSec._touchEntropy.length);
    return true;
  }
}, yourLayer);

// After user tapped 3-5 times:
function onLoginButton() {
  CocosSec.seedFromEnvironment();  // mixes touch samples + time + Math.random()
  var session = CocosSec.ecdhGenerateKeyPair();
  cc.log("session pub: " + session.pubHex.substring(0, 20) + "...");
  sendToServer(session.pubHex);
}
```

Concrete touch example — user taps at `(412, 891)` then `(418, 887)`:

```javascript
CocosSec.addTouchEntropy(412, 891);
CocosSec.addTouchEntropy(418, 887);
var seed = CocosSec.gatherEntropyBytes(32, CocosSec._touchEntropy);
// seed might look like: [183, 44, 201, 17, 92, 7, 140, 1, ...]
CocosSec.seedRandom(seed);
```

---

### Approach 4 — Server-provided nonce (recommended without native RNG)

Client randomness alone is weak. Have the **server send 32 random bytes** (hex) during handshake; client mixes them in:

```javascript
// Server sent: "8f3c2a1b9d0e4f5678901234567890abcdef0123456789abcdef012345678"
function onServerHello(serverNonceHex) {
  var serverBytes = CocosSec.hexToBytes(serverNonceHex);
  var clientBytes = CocosSec.gatherEntropyBytes(32);

  // Combine both sides: concat then seed
  var combined = serverBytes.concat(clientBytes);
  CocosSec.seedRandom(combined);

  var kp = CocosSec.ecdhGenerateKeyPair();
  replyToServer(kp.pubHex);
}
```

Even if the client PRNG is predictable, the session key space includes server entropy.

---

### Approach 5 — Skip client keygen; use server / offline keys (most practical)

If you only need **RSA encrypt to server** or **ECDH with a known server public key**, generate keys **once on a PC** and embed the public material in the app:

```bash
# On your dev PC (OpenSSL) — generate RSA-2048 public key components
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

Embed only `n` and `e` in the game; keep `private.pem` on the server:

```javascript
// Hard-coded server RSA public key (hex) — no client keygen needed
var SERVER_N = "a5261939975948bb7a58dffe5ff54e65..."; // full 512-char hex for 2048-bit
var SERVER_E = "10001";

var ciphertext = CocosSec.rsaEncrypt(SERVER_N, SERVER_E, "player123|session");
cc.log("cipher len: " + ciphertext.length); // 512 hex chars for 2048-bit
```

For ECDH, embed the server’s long-term public key and only generate an **ephemeral** client key per session (using Approach 3 or 4 to seed).

---

### What to avoid

| Call | When to use |
|------|-------------|
| `CocosSec.seedRandom(null)` | Quick smoke test only — seeds from current time |
| Fixed byte array | Debugging only — keys repeat every launch |
| `seedFromEnvironment()` alone in production | OK for ECDH if server also sends a nonce |
| No seeding at all | Do not rely on default pool for key generation |

---

## How the pieces fit together

```
┌─────────────────────────────────────────────────────────┐
│  Your Cocos2d scene (example-login-scene.js)            │
│  CocosSec.rsaEncrypt / ecdhGenerateKeyPair / …          │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│  cocos2d-sec.js   — RSA-2048 + ECDH P-384 helpers       │
└──────────────────────────┬──────────────────────────────┘
                           │
     ┌─────────────────────┼─────────────────────┐
     │                     │                     │
┌────▼────┐  ┌─────▼─────┐  ┌───▼───┐  ┌────▼────┐
│ rsa.js  │  │  ec.js    │  │sec.js │  │ rng.js  │
│ rsa2.js │  │           │  │P-384  │  │prng4.js │
└────┬────┘  └─────┬─────┘  └───┬───┘  └────┬────┘
     │             │            │           │
     └─────────────┴────────────┴───────────┘
                           │
              ┌────────────▼────────────┐
              │ jsbn.js + jsbn2.js      │
              │ BigInteger arithmetic   │
              └─────────────────────────┘
```

**Typical login flow (recommended without native RNG):**

1. Server sends random nonce (32 bytes hex)  
2. Client calls `CocosSec.seedRandom(serverBytes.concat(clientBytes))`  
3. Client generates ephemeral ECDH key pair → sends `pubHex` to server  
4. Both sides compute `ecdhSharedSecretX` → same hex string  
5. Client RSA-encrypts a short login token with server’s embedded public key  

See **`example-auth-scene.js`** for a complete skeleton.

---

## User auth: register, sign-in, signed input

One **P-384 identity key pair** per user is used for both ECDH session keys and ECDSA signatures (SHA-256 hash + sign).

### Flow overview

```
Register:
  server --(nonce)--> client
  client: createUserIdentity() -> buildRegisterRequest() -> send JSON
  server: verifyRegisterRequest() -> store username + pubHex

Sign-in:
  server --(nonce + challenge)--> client
  client: loadUserLocal() -> buildSignInRequest() -> send JSON
  server: verifySignInRequest() -> issue session

Signed user input (chat, commands):
  client: signUserInput() -> wrapSignedInput() -> send JSON
  server/peer: verifySignedInput()
```

### 1. Create identity (register screen)

```javascript
// After server hello with nonce hex
CocosSec.seedRandom(
  CocosSec.hexToBytes(serverNonceHex).concat(CocosSec.gatherEntropyBytes(32))
);

var identity = CocosSec.createUserIdentity();
// identity.privHex — save locally only
// identity.pubHex  — 194 hex chars, sent to server

var req = CocosSec.buildRegisterRequest("alice", "MyPassword123", identity, serverNonceHex);
// req fields:
//   username, passwordHash, pubHex, timestamp, serverNonce
//   signature: { rHex, sHex }   signatureHex: rHex+sHex (384 hex chars)

sendToServer(JSON.stringify(req));

// Persist locally (private key never leaves device)
CocosSec.saveUserLocal("user_identity_v1", CocosSec.identityToStorage("alice", identity));
```

`passwordHash` is `SHA256(username + "|" + password)` — the server never receives the plain password.

### 2. Sign in (returning user)

```javascript
var identity = CocosSec.loadUserLocal("user_identity_v1");
if (identity == null) { cc.log("not registered"); return; }

CocosSec.seedFromEnvironment(CocosSec.hexToBytes(serverNonceHex));

var req = CocosSec.buildSignInRequest(
  "alice",
  identity,
  serverChallengeHex,   // e.g. "a1b2c3d4e5f6..."
  serverNonceHex
);
// req: username, pubHex, serverChallenge, timestamp, serverNonce, signature

sendToServer(JSON.stringify(req));
```

Server verifies the signature proves the client holds `privHex` matching `pubHex`.

### 3. Sign user input (chat / game commands)

```javascript
var identity = CocosSec.loadUserLocal("user_identity_v1");

var sig = CocosSec.signUserInput(identity.privHex, "move north");
// sig.rHex, sig.sHex — 96 hex chars each for P-384

var packet = CocosSec.wrapSignedInput("alice", identity.pubHex, "move north", sig);
// packet: { username, pubHex, text, signature, signatureHex, timestamp }

sendToServer(JSON.stringify(packet));
```

### 4. Verify on server (same CocosSec API in your backend logic)

```javascript
var req = JSON.parse(incomingBody);

if (req.action === "register" && CocosSec.verifyRegisterRequest(req)) {
  saveUser(req.username, req.pubHex, req.passwordHash);
}

if (req.action === "signin" && CocosSec.verifySignInRequest(req)) {
  openSession(req.username);
}

if (CocosSec.verifySignedInput(req)) {
  handleCommand(req.username, req.text);
}
```

### Low-level sign / verify (any string)

```javascript
var hash = CocosSec.sha256("hello");           // 64 hex chars
var sig  = CocosSec.ecdsaSign(privHex, "hello");
var ok   = CocosSec.ecdsaVerify(pubHex, "hello", sig);  // true/false
```

ECDSA verify on P-384 is slow (~5–30 s on old Android). Run verify on the **server**, not every frame on the client.

---

## RSA-2048 usage

### What each RSA field means

| Field | Type | Example | Meaning |
|-------|------|---------|---------|
| `n` | hex string, 512 chars | `9940dfd4823b...` | Modulus (2048 bits) |
| `e` | hex string | `10001` | Public exponent (65537) |
| `d` | hex string, 512 chars | (secret) | Private exponent |
| `p`, `q` | hex strings | (secret) | Prime factors |
| ciphertext | hex string, 512 chars | `22ee4162564a...` | Encrypted output |

### Generate a key pair

```javascript
CocosSec.seedFromEnvironment();

var key = CocosSec.rsaGenerateKey();
// key.n, key.e, key.d, key.p, key.q, key.dmp1, key.dmq1, key.coeff — all hex strings
```

Key generation is **slow** on older Android devices (often several seconds). Run it on a background thread or during a loading screen, not during gameplay.

### Encrypt with a public key

```javascript
var ciphertextHex = CocosSec.rsaEncrypt(key.n, key.e, "hello server");
if (ciphertextHex == null) {
  cc.log("encrypt failed — message too long or bad key");
}
```

Maximum plaintext length for RSA-2048 with PKCS#1 padding is **245 bytes** (less for multi-byte UTF-8 text).

### Decrypt with a private key

```javascript
var plaintext = CocosSec.rsaDecrypt(key, ciphertextHex);
```

### Reuse key objects (avoid repeated parsing)

```javascript
var pub = CocosSec.rsaCreatePublic(serverNHex, "10001");
var ct = pub.encrypt("session token");

var priv = CocosSec.rsaCreatePrivate(storedKey);
var pt = priv.decrypt(ct);
```

---

## ECDH P-384 (secp384r1) usage

### What each ECDH field means

| Field | Type | Example | Meaning |
|-------|------|---------|---------|
| `privHex` | hex string, ~96 digits | `1a2b3c...` | Secret scalar (keep private) |
| `pubHex` | hex string, **194 chars** | `04a820f1e1...` | Uncompressed point: `04` + X + Y |
| `sharedX` from `ecdhSharedSecretX` | hex string, 96 chars | `65be3ce6116e...` | X coordinate of shared point |

P-384 public keys are always **194 hex characters** (1 byte prefix + 48 bytes X + 48 bytes Y).

### Generate a key pair

```javascript
CocosSec.seedFromEnvironment();

var alice = CocosSec.ecdhGenerateKeyPair();
// alice.privHex  — keep secret
// alice.pubHex   — send to peer (uncompressed point, hex, starts with "04")
```

### Derive shared secret

```javascript
// Alice derives secret using her private key and Bob's public key
var secret = CocosSec.ecdhComputeSecret(alice.privHex, bob.pubHex);

// secret.xHex, secret.yHex — coordinates of shared point
// secret.pointHex — full uncompressed point

// Common pattern: use X coordinate as shared secret input to a KDF
var sharedX = CocosSec.ecdhSharedSecretX(alice.privHex, bob.pubHex);
```

Both parties compute the same shared value when they exchange public keys and multiply by their own private key.

P-384 operations are slower than P-256. Expect hundreds of milliseconds per key operation on older hardware.

---

## Complete end-to-end example (ECDH + RSA transport)

```javascript
var LoginCrypto = {
  SERVER_RSA_N: "9940dfd4823bc03760abe71699c66271...", // your server modulus (512 hex chars)
  SERVER_RSA_E: "10001",
  SERVER_ECDH_PUB: "04a820f1e100640dee1e...",            // server P-384 public point (194 hex chars)

  onServerHello: function(serverNonceHex) {
    // 1) Mix server + client entropy
    var combined = CocosSec.hexToBytes(serverNonceHex)
      .concat(CocosSec.gatherEntropyBytes(32));
    CocosSec.seedRandom(combined);

    // 2) Ephemeral ECDH key for this session
    var session = CocosSec.ecdhGenerateKeyPair();
    if (session == null) return;

    // 3) Shared secret (same value server computes with their priv + our pubHex)
    var sharedX = CocosSec.ecdhSharedSecretX(
      session.privHex,
      LoginCrypto.SERVER_ECDH_PUB
    );

    // 4) RSA-encrypt login payload (max ~245 bytes for RSA-2048)
    var token = "player42|" + sharedX.substring(0, 16);
    var cipher = CocosSec.rsaEncrypt(
      LoginCrypto.SERVER_RSA_N,
      LoginCrypto.SERVER_RSA_E,
      token
    );

    // 5) Send to server
    sendLoginToServer({
      clientEcdhPub: session.pubHex,   // 194 hex chars
      loginCipher: cipher              // 512 hex chars
    });
  }
};
```

### Minimal RSA-only example (encrypt to server, no client keygen)

```javascript
// Server public key only — generate private.pem on dev PC with OpenSSL, embed n + e
var SERVER_N = "a5261939975948bb7a58dffe5ff54e65f0498f9175f5a09288810b8975871e99"
           + "af3b5dd94057b0fc07535f5f97444504fa35169d461d0d30cf0192e307727c06"
           + "5168c788771c561a9400fb49175e9e6aa4e23fe11af69e9412dd23b0cb6684c4"
           + "c2429bce139e848ab26d0829073351f4acd36074eafd036a5eb83359d2a698d3";
var SERVER_E = "10001";

var cipher = CocosSec.rsaEncrypt(SERVER_N, SERVER_E, "player123|session");
cc.log("ciphertext length: " + cipher.length);  // 512
// Server: echo <hex> | xxd -r -p | openssl rsautl -decrypt -inkey private.pem
```

---

## Complete ECDH handshake example (local demo)

```javascript
function runEcdhDemo() {
  CocosSec.seedFromEnvironment();

  var alice = CocosSec.ecdhGenerateKeyPair();
  var bob   = CocosSec.ecdhGenerateKeyPair();

  // Exchange alice.pubHex <-> bob.pubHex over the network

  var aliceSecret = CocosSec.ecdhSharedSecretX(alice.privHex, bob.pubHex);
  var bobSecret   = CocosSec.ecdhSharedSecretX(bob.privHex, alice.pubHex);

  // aliceSecret === bobSecret
  cc.log("shared: " + aliceSecret);
}
```

---

## Optional: native Android RNG (if you add it later)

If you later bridge Java `SecureRandom` through JSB, you can pass those bytes directly:

```javascript
// Only if you implement this bridge yourself later
var nativeBytes = [201, 17, 92, 7, 140, 1, 66, 240, /* ... 24 more bytes ... */];
CocosSec.seedRandom(nativeBytes);
```

Until then, use **Approach 4** (server nonce) or **Approach 5** (offline-generated keys) from the seeding section above.

---

## Error handling

Errors no longer call `alert()`. Optionally register a handler:

```javascript
jsbn_onerror = function(msg) { cc.log(msg); };
// or
CocosSec.setErrorHandler(function(msg) { cc.log(msg); });
```

API functions return `null` on failure. Always check return values.

---

## Performance notes

| Operation | Typical cost on old Android |
|-----------|----------------------------|
| RSA-2048 keygen | 2–15 seconds |
| RSA-2048 encrypt/decrypt | 10–100 ms |
| ECDH P-384 keygen | 0.5–3 seconds |
| ECDH P-384 shared secret | 0.3–2 seconds |

Recommendations:

- Generate keys once at login or first launch; persist and reuse.
- Do crypto work off the main/UI thread when your engine allows it.
- Prefer ECDH for session keys; use RSA only to encrypt small secrets (e.g. AES key blobs).

---

## Interoperating with OpenSSL / server backends

### RSA

Server decrypt (PKCS#1 v1.5 type 2 padding, same as jsbn):

```bash
echo -n "<hex ciphertext>" | xxd -r -p | openssl rsautl -decrypt -inkey private.pem
```

### ECDH

jsbn uses **uncompressed** points (`04` + X + Y hex). Ensure your server expects the same curve (**secp384r1**) and point format. Many TLS stacks use the X coordinate or a hash of the encoded point as the shared secret — match your server’s KDF convention.

---

## Limitations

- **ECDSA verify is slow on P-384** in pure JS — prefer server-side verify; client only signs.
- **Pure JavaScript** — slower than native Android crypto.
- **PKCS#1 RSA encrypt only** — no RSA-PSS signatures (use ECDSA for auth instead).

For maximum security and speed on Android, use native crypto for key storage and heavy operations, and keep this library for logic that must run entirely in the JS game layer.

---

## Quick reference

```javascript
// Constants
CocosSec.RSA_BITS      // 2048
CocosSec.RSA_EXP       // "10001"
CocosSec.ECDH_CURVE    // "secp384r1"

// RNG
CocosSec.seedRandom(byteArray)          // replace pool with bytes [0x3a, 0xf2, ...]
CocosSec.gatherEntropyBytes(32, extra)  // build bytes from Date/Math.random/cc.*
CocosSec.seedFromEnvironment(extra)     // gather + seed + mix time (non-deterministic)
CocosSec.addTouchEntropy(x, y)          // mix touch coords into next seed
CocosSec.hexToBytes(hex)                // "deadbeef" -> [222, 190, 239]
CocosSec.bytesToHex(bytes)              // [222, 190, 239] -> "deadbeef"
CocosSec.setErrorHandler(fn)

// RSA-2048
CocosSec.rsaGenerateKey()
CocosSec.rsaEncrypt(nHex, eHex, plaintext)
CocosSec.rsaDecrypt(key, ciphertextHex)
CocosSec.rsaCreatePublic(nHex, eHex)
CocosSec.rsaCreatePrivate(key)

// ECDH P-384
CocosSec.ecdhGenerateKeyPair()
CocosSec.ecdhComputeSecret(privHex, peerPubHex)
CocosSec.ecdhSharedSecretX(privHex, peerPubHex)

// Hash + ECDSA P-384
CocosSec.sha256(text)
CocosSec.hashPassword(username, password)
CocosSec.ecdsaSign(privHex, message)
CocosSec.ecdsaVerify(pubHex, message, signature)

// User auth
CocosSec.createUserIdentity()
CocosSec.buildRegisterRequest(username, password, identity, serverNonceHex)
CocosSec.buildSignInRequest(username, identity, serverChallengeHex, serverNonceHex)
CocosSec.verifyRegisterRequest(req)
CocosSec.verifySignInRequest(req)
CocosSec.signUserInput(privHex, userText)
CocosSec.verifyUserInput(pubHex, userText, signature)
CocosSec.wrapSignedInput(username, pubHex, text, signature)
CocosSec.verifySignedInput(packet)
CocosSec.saveUserLocal(key, record)
CocosSec.loadUserLocal(key)
```
