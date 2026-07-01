# Using jsbn with CEngine2d 1.5 Android

Pure legacy JavaScript cryptography for **RSA-2048** and **ECDH (secp384r1 / P-384)** — no Node.js, no browser, no bundler.

**New to crypto?** Start with **[BEGINNER-GUIDE.md](BEGINNER-GUIDE.md)** — concepts, exact values, step-by-step flows, and Node.js server setup.

This fork removes hard dependencies on `window`, `navigator`, and `alert()`, adds the **secp384r1** curve, and provides a thin **`CEngineSec`** API for game code.

---

## Is it really pure JavaScript?

**Yes — for runtime.** The game APK does not need Node.js, npm, a browser, or native crypto libraries.

| Question | Answer |
|----------|--------|
| Needs Node.js at runtime? | **No** |
| Needs browser DOM / `window`? | **No** (optional hooks only if present) |
| Needs native Android crypto? | **No** |
| Pure JS math (BigInteger, RSA, EC)? | **Yes** — Tom Wu jsbn, ES3-style globals |
| Files to ship in APK | 11 `.js` files (see load order below) |

### What runs inside CEngine2d

Everything is plain `.js` files loaded into the engine’s JavaScript VM (SpiderMonkey / JavaScriptCore). They define global functions and objects (`BigInteger`, `RSAKey`, `CEngineSec`, …) — the same model CEngine2d 1.5 already uses.

**Only standard JS + optional CEngine2d globals:**

| Used by | APIs |
|---------|------|
| All crypto core | `Math`, `Date`, `Array`, `String`, `parseInt` |
| `CEngineSec.gatherEntropyBytes` | above + optionally `cc.director`, `cc.sys` if `cc` exists |
| `rng.js` (optional) | `window.crypto` **only if** `window` happens to exist — skipped in CEngine2d |

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

This loads all scripts in a **sandbox with no `window`, `navigator`, `alert`, or `cc`** — the same conditions as embedded CEngine2d JS — then checks:

1. Pure sandbox load (`CEngineSec` + `CocosSec` alias)  
2. SHA-256 FIPS self-test (`abc` vector)  
3. P-384 generator coordinates (NIST vector `k=1`)  
4. P-384 scalar multiply `2×G` (NIST vector `k=2`)  
5. ECDH P-384 shared secret agreement  
6. ECDSA P-384 sign/verify, tamper rejection, `signatureHex` roundtrip  
7. Register / sign-in / signed-input auth flows + tamper rejection  
8. RSA-2048 encrypt/decrypt roundtrip  
9. Invalid inputs return `null`/`false` (no throw)  
10. Deterministic keys with fixed seed  

**All 10 groups must pass before you ship.**

### Known test vectors (fixed 32-byte seed)

Use this seed in your game to verify the port matches (debug builds only):

```javascript
var TEST_SEED = [
  0x3a, 0xf2, 0x91, 0x0c, 0x55, 0xe8, 0x17, 0x6b,
  0x02, 0x44, 0xac, 0x81, 0xd9, 0x3f, 0x70, 0x28,
  0xce, 0x11, 0x9a, 0x64, 0x05, 0xb2, 0xf8, 0x73,
  0x1d, 0x4e, 0x86, 0xc0, 0x39, 0xa7, 0x52, 0x6d
];
CEngineSec.seedRandom(TEST_SEED);
```

| Output | Expected shape | Verified prefix (this fork) |
|--------|----------------|----------------------------|
| `ecdhGenerateKeyPair().pubHex` | 194 hex chars, starts with `04` | `04b9a3ebdde9a29ca951594d0ed3b65a831e28d3...` |
| `ecdhGenerateKeyPair().privHex` | ~96–110 hex chars | (deterministic — re-run test to compare) |
| `rsaGenerateKey().n` | 512 hex chars (2048-bit) | `9940dfd4823bc03760abe71699c66271f54960d2...` |
| `rsaGenerateKey().e` | `10001` | always |
| `rsaEncrypt(n, e, "hello CEngine2d")` | 512 hex chars | decrypts back to `"hello CEngine2d"` |

If your build prints the same prefixes after `CEngineSec.seedRandom(TEST_SEED)`, the library is wired correctly.

### NIST P-384 curve verification (independent of RNG)

These constants are checked on every `test-smoke.js` run:

| Check | Expected |
|-------|----------|
| Generator `G.x` (hex, 96 chars) | `aa87ca22be8b05378eb1c71ef320ad746e1d3b628ba79b9859f741e082542a385502f25dbf55296c3a545e3872760ab7` |
| Generator `G.y` (hex, 96 chars) | `3617de4a96262c6f5d9e98bf9292dc29f8f41dbd289a147ce9da3113b5f0b8c00a60b1ce1d7e819d7a431d7c90ea0e5f` |
| Point `2×G.x` | `08d999057ba3d2d969260045c55b97f089025959a6f434d651d207d19fb96e9e4fe0e86ebe0e64f85b96a9c75295df61` |
| Point `2×G.y` | `8e80f1fa5b1b3cedb7bfe8dffd6dba74b275d875bc6cc43e904e505f256ab4255ffd43e94d39e22d61501e700a940e80` |

Curve parameters match **jsrsasign `ECParameterDB`** for `secp384r1`.

---

## Requirements vs jsbn (confirmed)

| Requirement | Status | Notes |
|-------------|--------|-------|
| Pure legacy JS (no Node/browser at runtime) | **OK** | 11 `.js` files, global scope |
| RSA-2048 encrypt/decrypt | **OK** | PKCS#1 v1.5 type 2 |
| EC P-384 ECDH | **OK** | `secp384r1`, uncompressed points |
| EC P-384 ECDSA sign | **OK** | Client should sign |
| EC P-384 ECDSA verify | **OK** | Prefer **server-side** verify (slow on device) |
| Register / sign-in / signed input | **OK** | `CEngineSec.build*Request` helpers |
| CEngine2d 1.5 / SpiderMonkey | **OK** | See runtime dependencies below |

---

## Do not mix jsbn auth with jsrsasign auth

This repo also ships [`jsrsasign/`](../jsrsasign/). **Pick one stack per project.**

| | **jsbn (`CEngineSec`)** | **jsrsasign (`CryptoManager`)** |
|--|-------------------------|----------------------------------|
| ECDSA hash | **SHA-256** then sign on P-384 | **SHA384withECDSA** |
| Signature wire format | `{ rHex, sHex }` or 192-char hex concat | ASN.1 DER hex (jsrsasign) |
| Interoperability | Server must use **jsbn protocol** below | Server must use jsrsasign docs |

If your server verifies with `SHA384withECDSA`, **jsbn signatures will fail**. Match server code to the stack you ship in the APK.

---

## Runtime dependencies (CEngine2d)

| API | Required globals | If missing |
|-----|------------------|------------|
| RSA / ECDH / ECDSA core | `Math`, `Date`, `Array`, `String`, `parseInt` | Always available in CEngine2d |
| `gatherEntropyBytes()` | optional `cc.director`, `cc.sys` | Falls back to time + `Math.random()` |
| `saveUserLocal()` / `loadUserLocal()` | `JSON`, `cc.sys.localStorage` | Returns `false` / `null` |
| Network payloads | `JSON.stringify` (your HTTP layer) | Implement manual serialization |

**Load scripts in global scope** (not inside a closure). Wrong load order → immediate `ReferenceError`.

**Backward-compatible alias:** `CocosSec` is defined as an alias for `CEngineSec` at the end of `cengine-sec.js`. Prefer `CEngineSec` in new code.

---

## Pre-ship checklist

- [ ] Run `node jsbn/test-smoke.js` — all 10 tests pass  
- [ ] All **11 scripts** loaded in order before game logic  
- [ ] Debug build: `CEngineSec.seedRandom(TEST_SEED)` → pub key prefix matches table above  
- [ ] Server verifies auth with **SHA-256 + ECDSA P-384** (not SHA384withECDSA)  
- [ ] Server sends fresh **nonce** (register/sign-in) and **challenge** (sign-in)  
- [ ] Client seeds RNG with `serverNonce + clientEntropy` before `createUserIdentity()`  
- [ ] Client **signs** only; server **verifies** (do not call `ecdsaVerify` every frame)  
- [ ] Do **not** ship `test-smoke.js`, `*.html` demos, or Node-only files in APK  
- [ ] HTTPS for all auth traffic (use jsrsasign `BizApiClient` or engine `XMLHttpRequest`)

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

Copy the entire `jsbn/` folder into your CEngine2d JavaScript source tree, for example:

```
YourGame/
  src/
    crypto/
      jsbn/
        jsbn.js
        jsbn2.js
        prng4.js
        rng.js
        sha256.js
        rsa.js
        rsa2.js
        ec.js
        sec.js
        ecdsa.js
        cengine-sec.js
        example-auth-scene.js   ← register / sign-in / signed input patterns
```

| File | Notes |
|------|-------|
| `test-smoke.js` | Dev-only verifier (10 test groups) — **do not ship in APK** |
| `example-auth-scene.js` | Copy patterns from here; optional in APK |

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
5. sha256.js
6. rsa.js
7. rsa2.js
8. ec.js
9. sec.js
10. ecdsa.js
11. cengine-sec.js
```

### CEngine2d-x JavaScript (JSB) example

If your project lists scripts in `project.json` or loads them in `main.js`:

```javascript
// main.js — load crypto scripts before game logic
(function() {
  var scripts = [
    "src/crypto/jsbn/jsbn.js",
    "src/crypto/jsbn/jsbn2.js",
    "src/crypto/jsbn/prng4.js",
    "src/crypto/jsbn/rng.js",
    "src/crypto/jsbn/sha256.js",
    "src/crypto/jsbn/rsa.js",
    "src/crypto/jsbn/rsa2.js",
    "src/crypto/jsbn/ec.js",
    "src/crypto/jsbn/sec.js",
    "src/crypto/jsbn/ecdsa.js",
    "src/crypto/jsbn/cengine-sec.js"
  ];
  for (var i = 0; i < scripts.length; i++) {
    require(scripts[i]);  // or your engine's equivalent script loader
  }
})();
```

If your CEngine2d 1.5 build does not support `require()`, include the files via whatever mechanism your template uses (concatenation, manual `<script>` tags in the bootstrap HTML, or engine-specific script registration).

---

## Seed randomness before key generation

**Always seed the RNG** before generating keys. In CEngine2d embedded JS there is no `window.crypto` and (in this guide) no Android `SecureRandom` bridge.

`seedRandom` accepts a JavaScript array of byte values (`0`–`255`). Each call **mixes** new bytes into the pool; call it at startup and again right before key generation.

```javascript
CEngineSec.setErrorHandler(function(msg) {
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
CEngineSec.seedRandom(testSeed);

var key = CEngineSec.rsaGenerateKey();
cc.log("modulus starts with: " + key.n.substring(0, 16));
// Always the same prefix for this seed, e.g. "a4f3c2..."
```

You can also build bytes from a hex string (built into `CEngineSec`):

```javascript
CEngineSec.seedRandom(CEngineSec.hexToBytes(
  "deadbeef0123456789abcdef0123456789abcdef0123456789abcdef01234567"
));
```

After seeding with `TEST_SEED` above, this public key prefix confirms ECDH works:

```javascript
CEngineSec.seedRandom(TEST_SEED);
var kp = CEngineSec.ecdhGenerateKeyPair();
cc.log(kp.pubHex.substring(0, 40));
// expect: 04b9a3ebdde9a29ca951594d0ed3b65a831e28d3
```

---

### Approach 2 — JS-only environment entropy (no native code)

`CEngineSec.gatherEntropyBytes()` collects what is available in plain CEngine2d JS: `Date`, `Math.random()`, frame counter, OS/platform string.

```javascript
// Returns 32 ints 0-255, e.g. [183, 44, 201, 17, 92, ...]
var seed = CEngineSec.gatherEntropyBytes(32);
CEngineSec.seedRandom(seed);

var alice = CEngineSec.ecdhGenerateKeyPair();
cc.log("alice pub starts with: " + alice.pubHex.substring(0, 8)); // "046AA87C..."
```

One-liner wrapper:

```javascript
CEngineSec.seedFromEnvironment();
var bob = CEngineSec.ecdhGenerateKeyPair();
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
    CEngineSec.addTouchEntropy(p.x | 0, p.y | 0);
    cc.log("entropy samples: " + CEngineSec._touchEntropy.length);
    return true;
  }
}, yourLayer);

// After user tapped 3-5 times:
function onLoginButton() {
  CEngineSec.seedFromEnvironment();  // mixes touch samples + time + Math.random()
  var session = CEngineSec.ecdhGenerateKeyPair();
  cc.log("session pub: " + session.pubHex.substring(0, 20) + "...");
  sendToServer(session.pubHex);
}
```

Concrete touch example — user taps at `(412, 891)` then `(418, 887)`:

```javascript
CEngineSec.addTouchEntropy(412, 891);
CEngineSec.addTouchEntropy(418, 887);
var seed = CEngineSec.gatherEntropyBytes(32, CEngineSec._touchEntropy);
// seed might look like: [183, 44, 201, 17, 92, 7, 140, 1, ...]
CEngineSec.seedRandom(seed);
```

---

### Approach 4 — Server-provided nonce (recommended without native RNG)

Client randomness alone is weak. Have the **server send 32 random bytes** (hex) during handshake; client mixes them in:

```javascript
// Server sent: "8f3c2a1b9d0e4f5678901234567890abcdef0123456789abcdef012345678"
function onServerHello(serverNonceHex) {
  var serverBytes = CEngineSec.hexToBytes(serverNonceHex);
  var clientBytes = CEngineSec.gatherEntropyBytes(32);

  // Combine both sides: concat then seed
  var combined = serverBytes.concat(clientBytes);
  CEngineSec.seedRandom(combined);

  var kp = CEngineSec.ecdhGenerateKeyPair();
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

var ciphertext = CEngineSec.rsaEncrypt(SERVER_N, SERVER_E, "player123|session");
cc.log("cipher len: " + ciphertext.length); // 512 hex chars for 2048-bit
```

For ECDH, embed the server’s long-term public key and only generate an **ephemeral** client key per session (using Approach 3 or 4 to seed).

---

### What to avoid

| Call | When to use |
|------|-------------|
| `CEngineSec.seedRandom(null)` | Quick smoke test only — seeds from current time |
| Fixed byte array | Debugging only — keys repeat every launch |
| `seedFromEnvironment()` alone in production | OK for ECDH if server also sends a nonce |
| No seeding at all | Do not rely on default pool for key generation |

---

## How the pieces fit together

```
┌─────────────────────────────────────────────────────────┐
│  Your CEngine2d scene (example-auth-scene.js)             │
│  CEngineSec.rsaEncrypt / ecdhGenerateKeyPair / …          │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│  cengine-sec.js   — RSA-2048 + ECDH P-384 helpers       │
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
2. Client calls `CEngineSec.seedRandom(serverBytes.concat(clientBytes))`  
3. Client generates ephemeral ECDH key pair → sends `pubHex` to server  
4. Both sides compute `ecdhSharedSecretX` → same hex string  
5. Client RSA-encrypts a short login token with server’s embedded public key  

See **`example-auth-scene.js`** for a complete skeleton.

---

## User auth: register, sign-in, signed input

One **P-384 identity key pair** per user is used for both ECDH session keys and ECDSA signatures (**SHA-256** hash, then ECDSA on `secp384r1`).

### Canonical signed strings (server must rebuild exactly)

| Action | Canonical string (`|` separated) |
|--------|----------------------------------|
| Register | `register\|{username}\|{passwordHash}\|{pubHex}\|{timestamp}\|{serverNonce}` |
| Sign-in | `signin\|{username}\|{serverChallenge}\|{timestamp}\|{serverNonce}` |
| User input | `input\|{userText}` |

- `passwordHash` = `CEngineSec.hashPassword(username, password)` → `SHA256(username + "|" + password)`  
- `timestamp` = milliseconds from `new Date().getTime()` (number; same value in JSON body and canonical string)  
- Signature = ECDSA over `SHA256(canonicalString)`; wire as `{ rHex, sHex }` (96 hex chars each) or `signatureHex` (192 chars)

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
CEngineSec.seedRandom(
  CEngineSec.hexToBytes(serverNonceHex).concat(CEngineSec.gatherEntropyBytes(32))
);

var identity = CEngineSec.createUserIdentity();
// identity.privHex — save locally only
// identity.pubHex  — 194 hex chars, sent to server

var req = CEngineSec.buildRegisterRequest("alice", "MyPassword123", identity, serverNonceHex);
// req fields:
//   username, passwordHash, pubHex, timestamp, serverNonce
//   signature: { rHex, sHex }   signatureHex: rHex+sHex (192 hex chars)

sendToServer(JSON.stringify(req));

// Persist locally (private key never leaves device)
CEngineSec.saveUserLocal("user_identity_v1", CEngineSec.identityToStorage("alice", identity));
```

`passwordHash` is `SHA256(username + "|" + password)` — the server never receives the plain password.

### 2. Sign in (returning user)

```javascript
var identity = CEngineSec.loadUserLocal("user_identity_v1");
if (identity == null) { cc.log("not registered"); return; }

CEngineSec.seedFromEnvironment(CEngineSec.hexToBytes(serverNonceHex));

var req = CEngineSec.buildSignInRequest(
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
var identity = CEngineSec.loadUserLocal("user_identity_v1");

var sig = CEngineSec.signUserInput(identity.privHex, "move north");
// sig.rHex, sig.sHex — 96 hex chars each for P-384

var packet = CEngineSec.wrapSignedInput("alice", identity.pubHex, "move north", sig);
// packet: { username, pubHex, text, signature, signatureHex, timestamp }

sendToServer(JSON.stringify(packet));
```

### 4. Verify on server

Rebuild the same canonical string, then verify. Example (Node.js with jsbn loaded the same way as `test-smoke.js`):

```javascript
function verifyRegisterOnServer(body) {
  var req = JSON.parse(body);
  if (req.action !== "register") return false;
  if (!isFreshNonce(req.serverNonce)) return false;  // your replay guard

  var canonical = [
    "register", req.username, req.passwordHash,
    req.pubHex, req.timestamp, req.serverNonce
  ].join("|");

  var sig = req.signature;
  if (!sig && req.signatureHex) {
    sig = ecdsaSigFromHex(req.signatureHex, "secp384r1");
  }
  return CEngineSec.ecdsaVerify(req.pubHex, canonical, sig);
}

function verifySignInOnServer(body, storedPubHex) {
  var req = JSON.parse(body);
  if (req.action !== "signin") return false;
  if (req.pubHex !== storedPubHex) return false;  // must match registered key
  if (!isFreshChallenge(req.serverChallenge, req.serverNonce)) return false;

  var canonical = [
    "signin", req.username, req.serverChallenge,
    req.timestamp, req.serverNonce
  ].join("|");

  var sig = req.signature || ecdsaSigFromHex(req.signatureHex, "secp384r1");
  return CEngineSec.ecdsaVerify(storedPubHex, canonical, sig);
}

function verifySignedInputOnServer(body, storedPubHex) {
  var pkt = JSON.parse(body);
  if (pkt.pubHex !== storedPubHex) return false;  // lookup username -> pubHex first
  return CEngineSec.verifySignedInput(pkt);
}
```

**Server responsibilities (not automatic in jsbn):**

- Store `username → pubHex` at register; reject sign-in if `pubHex` differs  
- Expire `serverNonce` and `serverChallenge` after one use or short TTL  
- For signed input, resolve `username` / `pubHex` against registered keys  
- Run `ecdsaVerify` on the server — not on the game client each frame  

### 5. Full client module (copy from repo)

See **`example-auth-scene.js`** for `UserAuth` with register, sign-in, and `signInput`:

```javascript
// After loading all 11 jsbn scripts:
UserAuth.init();
UserAuth.onServerHello(serverNonceHex);           // seeds RNG
UserAuth.register("alice", "MyPassword123");      // first launch
UserAuth.signIn("alice");                         // returning user (set SERVER_CHALLENGE first)
UserAuth.signInput("alice", "move north");        // signed game command
```

### Low-level sign / verify (any string)

```javascript
var hash = CEngineSec.sha256("hello");           // 64 hex chars
var sig  = CEngineSec.ecdsaSign(privHex, "hello");
var ok   = CEngineSec.ecdsaVerify(pubHex, "hello", sig);  // true/false
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
CEngineSec.seedFromEnvironment();

var key = CEngineSec.rsaGenerateKey();
// key.n, key.e, key.d, key.p, key.q, key.dmp1, key.dmq1, key.coeff — all hex strings
```

Key generation is **slow** on older Android devices (often several seconds). Run it on a background thread or during a loading screen, not during gameplay.

### Encrypt with a public key

```javascript
var ciphertextHex = CEngineSec.rsaEncrypt(key.n, key.e, "hello server");
if (ciphertextHex == null) {
  cc.log("encrypt failed — message too long or bad key");
}
```

Maximum plaintext length for RSA-2048 with PKCS#1 padding is **245 bytes** (less for multi-byte UTF-8 text).

### Decrypt with a private key

```javascript
var plaintext = CEngineSec.rsaDecrypt(key, ciphertextHex);
```

### Reuse key objects (avoid repeated parsing)

```javascript
var pub = CEngineSec.rsaCreatePublic(serverNHex, "10001");
var ct = pub.encrypt("session token");

var priv = CEngineSec.rsaCreatePrivate(storedKey);
var pt = priv.decrypt(ct);
```

---

## ECDH P-384 (secp384r1) usage

### What each ECDH field means

| Field | Type | Example | Meaning |
|-------|------|---------|---------|
| `privHex` | hex string, ~96 digits | `1a2b3c...` | Secret scalar (keep private) |
| `pubHex` | hex string, **194 chars** | `04b9a3ebdde9a29ca951594d0ed3b65a831e28d3...` | Uncompressed point: `04` + X + Y |
| `sharedX` from `ecdhSharedSecretX` | hex string, 96 chars | `65be3ce6116e...` | X coordinate of shared point |

P-384 public keys are always **194 hex characters** (1 byte prefix + 48 bytes X + 48 bytes Y).

### Generate a key pair

```javascript
CEngineSec.seedFromEnvironment();

var alice = CEngineSec.ecdhGenerateKeyPair();
// alice.privHex  — keep secret
// alice.pubHex   — send to peer (uncompressed point, hex, starts with "04")
```

### Derive shared secret

```javascript
// Alice derives secret using her private key and Bob's public key
var secret = CEngineSec.ecdhComputeSecret(alice.privHex, bob.pubHex);

// secret.xHex, secret.yHex — coordinates of shared point
// secret.pointHex — full uncompressed point

// Common pattern: use X coordinate as shared secret input to a KDF
var sharedX = CEngineSec.ecdhSharedSecretX(alice.privHex, bob.pubHex);
```

Both parties compute the same shared value when they exchange public keys and multiply by their own private key.

P-384 operations are slower than P-256. Expect hundreds of milliseconds per key operation on older hardware.

---

## Complete end-to-end example (ECDH + RSA transport)

```javascript
var LoginCrypto = {
  SERVER_RSA_N: "9940dfd4823bc03760abe71699c66271...", // your server modulus (512 hex chars)
  SERVER_RSA_E: "10001",
  SERVER_ECDH_PUB: "04b9a3ebdde9a29ca951594d0ed3b65a831e28d3...",  // server P-384 public point (194 hex chars)

  onServerHello: function(serverNonceHex) {
    // 1) Mix server + client entropy
    var combined = CEngineSec.hexToBytes(serverNonceHex)
      .concat(CEngineSec.gatherEntropyBytes(32));
    CEngineSec.seedRandom(combined);

    // 2) Ephemeral ECDH key for this session
    var session = CEngineSec.ecdhGenerateKeyPair();
    if (session == null) return;

    // 3) Shared secret (same value server computes with their priv + our pubHex)
    var sharedX = CEngineSec.ecdhSharedSecretX(
      session.privHex,
      LoginCrypto.SERVER_ECDH_PUB
    );

    // 4) RSA-encrypt login payload (max ~245 bytes for RSA-2048)
    var token = "player42|" + sharedX.substring(0, 16);
    var cipher = CEngineSec.rsaEncrypt(
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

var cipher = CEngineSec.rsaEncrypt(SERVER_N, SERVER_E, "player123|session");
cc.log("ciphertext length: " + cipher.length);  // 512
// Server: echo <hex> | xxd -r -p | openssl rsautl -decrypt -inkey private.pem
```

---

## Complete ECDH handshake example (local demo)

```javascript
function runEcdhDemo() {
  CEngineSec.seedFromEnvironment();

  var alice = CEngineSec.ecdhGenerateKeyPair();
  var bob   = CEngineSec.ecdhGenerateKeyPair();

  // Exchange alice.pubHex <-> bob.pubHex over the network

  var aliceSecret = CEngineSec.ecdhSharedSecretX(alice.privHex, bob.pubHex);
  var bobSecret   = CEngineSec.ecdhSharedSecretX(bob.privHex, alice.pubHex);

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
CEngineSec.seedRandom(nativeBytes);
```

Until then, use **Approach 4** (server nonce) or **Approach 5** (offline-generated keys) from the seeding section above.

---

## Error handling

Errors no longer call `alert()`. Optionally register a handler:

```javascript
jsbn_onerror = function(msg) { cc.log(msg); };
// or
CEngineSec.setErrorHandler(function(msg) { cc.log(msg); });
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
| ECDSA P-384 **sign** (client) | 1–8 seconds |
| ECDSA P-384 **verify** (client) | 5–30+ seconds — **avoid on device** |

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

- **ECDSA verify is slow on P-384** in pure JS — client signs, server verifies  
- **SHA-256 + ECDSA**, not SHA384withECDSA — must match jsrsasign stack if you switch stacks  
- **Pure JavaScript** — slower than native Android crypto  
- **PKCS#1 RSA encrypt only** — no RSA-PSS (use ECDSA for auth)  
- **Auth helpers do not prevent replay** — server must validate nonce/challenge/timestamp  
- **`verifySignedInput` does not bind username to pubHex** — server must lookup registered key  
- **HTML demos** (`*.html`) use `alert()` — do not ship in APK  

For maximum security and speed on Android, use native crypto for key storage where possible; keep this library for logic that must run entirely in the JS game layer.

---

## Quick reference

```javascript
// Global API: CEngineSec (alias: CocosSec)
CEngineSec.RSA_BITS      // 2048
CEngineSec.RSA_EXP       // "10001"
CEngineSec.ECDH_CURVE    // "secp384r1"

// RNG
CEngineSec.seedRandom(byteArray)          // replace pool with bytes [0x3a, 0xf2, ...]
CEngineSec.gatherEntropyBytes(32, extra)  // build bytes from Date/Math.random/cc.*
CEngineSec.seedFromEnvironment(extra)     // gather + seed + mix time (non-deterministic)
CEngineSec.addTouchEntropy(x, y)          // mix touch coords into next seed
CEngineSec.hexToBytes(hex)                // "deadbeef" -> [222, 190, 239]
CEngineSec.bytesToHex(bytes)              // [222, 190, 239] -> "deadbeef"
CEngineSec.setErrorHandler(fn)

// RSA-2048
CEngineSec.rsaGenerateKey()
CEngineSec.rsaEncrypt(nHex, eHex, plaintext)
CEngineSec.rsaDecrypt(key, ciphertextHex)
CEngineSec.rsaCreatePublic(nHex, eHex)
CEngineSec.rsaCreatePrivate(key)

// ECDH P-384
CEngineSec.ecdhGenerateKeyPair()
CEngineSec.ecdhComputeSecret(privHex, peerPubHex)
CEngineSec.ecdhSharedSecretX(privHex, peerPubHex)

// Hash + ECDSA P-384
CEngineSec.sha256(text)
CEngineSec.hashPassword(username, password)
CEngineSec.ecdsaSign(privHex, message)
CEngineSec.ecdsaVerify(pubHex, message, signature)

// User auth
CEngineSec.createUserIdentity()
CEngineSec.buildRegisterRequest(username, password, identity, serverNonceHex)
CEngineSec.buildSignInRequest(username, identity, serverChallengeHex, serverNonceHex)
CEngineSec.verifyRegisterRequest(req)
CEngineSec.verifySignInRequest(req)
CEngineSec.signUserInput(privHex, userText)
CEngineSec.verifyUserInput(pubHex, userText, signature)
CEngineSec.wrapSignedInput(username, pubHex, text, signature)
CEngineSec.verifySignedInput(packet)
CEngineSec.saveUserLocal(key, record)
CEngineSec.loadUserLocal(key)
```
