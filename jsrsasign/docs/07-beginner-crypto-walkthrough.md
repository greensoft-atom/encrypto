# 07 — Beginner Crypto Walkthrough (Step-by-Step with Real Values)

This guide is for developers **new to encryption, signing, keys, PEM, and seeds**. It uses the **jsrsasign stack** in this repo (`CryptoManager` → `IdentityManager` → `BizApiClient`).

Every step lists **exact function names, parameters, and example values** you can compare against when debugging.

---

## Part 0 — Plain-English concepts

### Hash (SHA-256 / SHA-384)

A **hash** turns any text into a fixed-length fingerprint. Same input → same output. You **cannot** reverse it.

| Input | Function | Output (hex, 64 chars for SHA-256) |
|-------|----------|-------------------------------------|
| `"aaa"` | `CryptoManager.sha256("aaa")` | `9834876dcfb05cb167a5c24953eba58c4ac89b1adf57f28f2f9d09af107ee8f0` |
| `"alice\|secret123"` | `CryptoManager.sha256("alice\|secret123")` | `54f1503510102b99316c1ee65f708ebe226969d72b3259e17f69db4ba7000954` |

**Used for:** password transport hash, key fingerprints, integrity checks.

**Not used for:** storing passwords on the server (use bcrypt/Argon2 on the server).

---

### Sign vs Verify (digital signature)

| Operation | Who has what | Analogy |
|-----------|--------------|---------|
| **Sign** | Private key + message | Wax seal on a letter — only you can make it |
| **Verify** | Public key + message + signature | Anyone can check the seal is yours |

**Sign does NOT hide the message.** The server still reads `"move north"` in plain text. The signature proves **who sent it** and that **nobody changed it**.

```javascript
var sigHex = CryptoManager.signECC("hello", privateKeyHandle);
// sigHex example prefix: "3064023064..."  (DER-encoded ECDSA, always starts with 30)

var ok = CryptoManager.verifyECC("hello", sigHex, publicKeyHandle);
// ok === true
```

If someone changes `"hello"` to `"hacked"`, verify returns `false`.

---

### Encrypt vs Decrypt (NOT the main auth mechanism here)

| | Sign/Verify | Encrypt/Decrypt |
|--|-------------|-----------------|
| Goal | Prove identity + integrity | Hide content from readers |
| Key used | Private to sign, public to verify | Public to encrypt, private to decrypt (RSA) or shared secret (AES) |
| In this project | **Yes — main auth path** | **Minimal** — only `privEnc` obfuscation on device |

This stack **does not** RSA-encrypt API payloads. HTTPS (TLS) encrypts transport. Signatures protect **application-level auth**.

---

### Key pair (EC P-384)

Every user gets **two linked keys**:

| Key | Stored where | Format in this project | Length |
|-----|--------------|------------------------|--------|
| **Private** | Device only (`privEnc` in localStorage) | `privHex` — hex string | 96 hex chars (48 bytes) |
| **Public** | Device + server database | `pubHex` — hex string | 194 hex chars (97 bytes), starts with `04` |

**Curve name (always):** `"secp384r1"` (also called P-384)

**Default signature algorithm:** `"SHA384withECDSA"`

```javascript
var kp = CryptoManager.generateECC("secp384r1");
// kp.pubHex  → "04..."  (194 chars)
// kp.privHex → "abc..." (96 chars) — NEVER send to server
// kp.curve   → "secp384r1"
// kp.type    → "EC"
```

---

### PEM (Privacy-Enhanced Mail format)

**PEM** is a text file format for keys — base64 with header/footer lines.

Example public key PEM (from a real `exportPublicPEM` call):

```text
-----BEGIN PUBLIC KEY-----
MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAExFAznIL3yEQFH6k0enlvgmdsOlyz09x3
HUPxIcsI7+jAKB14UqwPs+meekYdtyXlPFUc+/AVFZ5w5UwpGlGdyJ86MhBR/Ntw
2pVK+sUkFN4q2SeHWmtfdJwXE0zrue+P
-----END PUBLIC KEY-----
```

| Function | Parameters | Returns |
|----------|------------|---------|
| `CryptoManager.exportPublicPEM(keyHandle)` | handle from `generateECC` | PEM string |
| `CryptoManager.loadPublicKey(pemString)` | PEM text | public key handle |
| `CryptoManager.exportPrivatePEM(keyHandle, "PKCS8PRV")` | private handle | PEM (dev only — protect file!) |

**In normal biz flows you use `pubHex` / `privHex`, not PEM.** PEM is for importing keys from tools or server config files.

---

### Seed, entropy, nonce, challenge

These words appear often. Here is what each means **in this project**:

| Term | Meaning | Example value | Where set |
|------|---------|---------------|-----------|
| **Entropy** | Random unpredictable bytes for key generation | mixed from time, touch, server nonce | `CryptoManager.seedFromEnvironment()` |
| **Seed** | Feed entropy into jsrsasign's internal random pool | server nonce hex | `IdentityManager.onServerHello(nonce)` |
| **serverNonce** | Random hex from server, prevents replay | `a1b2c3d4e5f6789012345678abcdef0123456789abcdef0123456789abcdef0123456789` (64 hex chars = 32 bytes) | `GET /api/hello` |
| **serverChallenge** | Random hex for login step | `challenge99887766554433221100aabbccddeeff` | `POST /api/login/password` response |
| **Canonical string** | Exact pipe-separated text both sides sign | `register\|alice\|54f150...\|04...\|1782867012321\|a1b2...` | Built by `IdentityManager._canonical()` |

**Rule:** Call `onServerHello(serverNonce)` **before** generating keys or registering.

---

### Hex encoding

| | Hex | Base64 |
|--|-----|--------|
| Example | `deadbeef` | `3q2+7w==` |
| Functions | `CryptoManager.bytesToHex`, `hexDecode` | `base64Encode`, `base64Decode` |
| Used for | Keys, signatures, hashes | PEM bodies, some APIs |

---

## Part 1 — What you call (layer map)

```text
Your UI / biz code
    │
    ├─ BizApiClient.init({ baseUrl: "https://api.example.com" })
    ├─ BizApiClient.register("alice", "secret123", callback)
    ├─ BizApiClient.login("alice", "secret123", callback)
    └─ BizApiClient.sendAction("alice", "move north", callback)
            │
            ▼
    IdentityManager  (users, sessions, canonical strings)
            │
            ▼
    CryptoManager      (hash, sign, verify, keys)
            │
            ▼
    jsrsasign-all-min.js  (never call directly from biz code)
```

---

## Part 2 — Setup (do once at app start)

### Step 2.1 — Load scripts in order

```javascript
require("src/crypto/cengine-bootstrap.js");   // fixes missing navigator
require("src/crypto/jsrsasign-all-min.js");
require("src/crypto/CryptoManager.js");
require("src/crypto/IdentityManager.js");
require("src/network/NetworkManager.js");
require("src/network/BizApiClient.js");
```

### Step 2.2 — Initialize

```javascript
BizApiClient.init({
  baseUrl: "https://api.example.com",   // exact parameter name: baseUrl
  timeoutMs: 30000,                      // optional, default 30000
  headers: {                             // optional
    "Content-Type": "application/json",
    "Accept": "application/json"
  },
  endpoints: {                           // optional — override paths
    hello: "/api/hello",
    register: "/api/register",
    loginPassword: "/api/login/password",
    loginSignin: "/api/login/signin",
    action: "/api/action"
  },
  log: function(msg) { cc.log(msg); }   // optional
});
```

**Internal calls triggered:**

```text
BizApiClient.init()
  → IdentityManager.init()
      → CryptoManager.initialize()
  → NetworkManager.initialize({ baseUrl, timeoutMs, headers })
```

### Step 2.3 — Self-check (optional)

```javascript
var h = CryptoManager.sha256("aaa");
// Must equal: 9834876dcfb05cb167a5c24953eba58c4ac89b1adf57f28f2f9d09af107ee8f0
cc.log("crypto self-check: " + (h.length === 64 ? "OK" : "FAIL"));
```

---

## Part 3 — Registration (full call flow)

### Overview

```text
User taps Register
    → GET /api/hello          (get serverNonce)
    → generate EC key pair    (on device)
    → sign register payload   (with new private key)
    → save encrypted key      (localStorage)
    → POST /api/register      (send signed payload)
    → server verifies signature, saves username + passwordHash + pubHex
```

### Step 3.1 — Server hello

**HTTP request:**

```http
GET https://api.example.com/api/hello
Accept: application/json
```

**HTTP response (example):**

```json
{
  "serverNonce": "a1b2c3d4e5f6789012345678abcdef0123456789abcdef0123456789abcdef0123456789",
  "serverTime": 1750000000000
}
```

**Client call:**

```javascript
IdentityManager.onServerHello("a1b2c3d4e5f6789012345678abcdef0123456789abcdef0123456789abcdef0123456789");
```

**What happens inside:**

```text
onServerHello(serverNonceHex)
  → IdentityManager.SERVER_NONCE = serverNonceHex
  → CryptoManager.seedFromEnvironment(serverNonceHex)
      → mixes nonce + time + Math.random + touch entropy
      → calls rng_seed_int() for each 4-byte chunk
      → calls rng_seed_time()
```

### Step 3.2 — Compute password transport hash

**Formula (exact):**

```text
passwordHash = SHA256(username + "|" + password)
```

**Real values:**

| Parameter | Value |
|-----------|-------|
| `username` | `"alice"` |
| `password` | `"secret123"` |
| String hashed | `"alice\|secret123"` |
| `passwordHash` | `54f1503510102b99316c1ee65f708ebe226969d72b3259e17f69db4ba7000954` |

**Code:**

```javascript
var passwordHash = CryptoManager.sha256("alice" + "|" + "secret123");
// same as IdentityManager internal: _passwordTransportHash("alice", "secret123")
```

### Step 3.3 — Generate key pair

```javascript
var identity = IdentityManager.createIdentity("secp384r1");
```

**Returns object:**

```javascript
{
  handle: { type: "EC", curve: "secp384r1", privHex: "...", pubHex: "04...", ... },
  pubHex:  "0488f9831bde1f1ed8117e89e14a36c4557d05edff628b93a04d28d7bda8b53f...",
  privHex: "1a2b3c...",   // 96 hex characters — example only, changes each run
  curve:   "secp384r1",
  createdAt: 1782867012321
}
```

**Note:** `pubHex` and `privHex` change every run (random keygen). `passwordHash` is always the same for the same username/password.

### Step 3.4 — Build canonical register string

**Formula (field order is fixed — do not reorder):**

```text
register|{username}|{passwordHash}|{pubHex}|{timestamp}|{serverNonce}
```

**Real example (one captured run):**

```text
register|alice|54f1503510102b99316c1ee65f708ebe226969d72b3259e17f69db4ba7000954|0488f9831bde1f1ed8117e89e14a36c4557d05edff628b93a04d28d7bda8b53ff45f24c910e5cace8f788d102ed7e228dfbab88d8a29066d1d756ea957c2e836556e69911412a6f8c6f1bbf118d0a8f2d216e43b5c83833629fb9637764b06264a|1782867012321|a1b2c3d4e5f6789012345678abcdef0123456789abcdef0123456789abcdef0123456789
```

**Code:**

```javascript
var req = IdentityManager.buildRegisterRequest("alice", "secret123", identity);
// req === null if identity missing pubHex/privHex
```

### Step 3.5 — Sign canonical string

**Internal call:**

```javascript
var sigHex = CryptoManager.signECC(canonicalString, identity.handle, "SHA384withECDSA");
// sigHex prefix example: "30640230641e19307326c6342585b36c3d50bbe4..."
// sigHex length: ~200 hex chars (varies slightly)
// First two chars always "30" (DER SEQUENCE)
```

### Step 3.6 — Register request JSON (POST body)

**Endpoint:** `POST https://api.example.com/api/register`

**Body (exact field names):**

```json
{
  "action": "register",
  "username": "alice",
  "passwordHash": "54f1503510102b99316c1ee65f708ebe226969d72b3259e17f69db4ba7000954",
  "pubHex": "0488f9831bde1f1ed8117e89e14a36c4557d05edff628b93a04d28d7bda8b53ff45f24c910e5cace8f788d102ed7e228dfbab88d8a29066d1d756ea957c2e836556e69911412a6f8c6f1bbf118d0a8f2d216e43b5c83833629fb9637764b06264a",
  "curve": "secp384r1",
  "timestamp": 1782867012321,
  "serverNonce": "a1b2c3d4e5f6789012345678abcdef0123456789abcdef0123456789abcdef0123456789",
  "signatureHex": "30640230641e19307326c6342585b36c3d50bbe4..."
}
```

### Step 3.7 — Save identity locally

**Storage key:** `"identity_v1"` (constant `IdentityManager.STORAGE_KEY`)

**Saved record (example — `privEnc` changes each run):**

```json
{
  "version": 1,
  "username": "alice",
  "pubHex": "04eaf90650044c11427a4828aa0668d6070362a699ec5b61f78fed7c59b36ca48b71557028c47b214d6e25d564b7f90af29b149de40f7825b4d445040dd3198beb2f08efbadadd59fb258a5bf2b150215b4c705323d6df5fec28bbad14fa954681",
  "curve": "secp384r1",
  "keyId": "4ad708018ecbc8eed8a125aa053170ac28f773c942e8681761191d2ecae3a15204883b6b27275a881f4193f02831298d",
  "createdAt": 1782867039199,
  "privEnc": "334957d5f0d5067add6b8ce3288e45d6f661b5cc294399da331176098a2e56294058865a47f824051b0f607ed1d0bd7c"
}
```

**Important:** There is **no** `privHex` field when password is provided — only `privEnc`.

**One-liner (does steps 3.1–3.7 via HTTPS):**

```javascript
BizApiClient.register("alice", "secret123", function(res) {
  if (res.ok) {
    cc.log("registered: " + res.username);
  } else {
    cc.log("failed: " + res.error + " code=" + res.code);
  }
});
```

**BizApiClient.register internal sequence:**

```text
register("alice", "secret123", callback)
  → fetchHello(callback)
      → NetworkManager.get("/api/hello", ...)
      → IdentityManager.onServerHello(res.data.serverNonce)
  → IdentityManager.register("alice", "secret123")
      → createIdentity()
      → buildRegisterRequest(...)
      → identityToRecord(...)  → privEnc stored
      → saveLocal(record)      → cc.sys.localStorage
  → NetworkManager.post("/api/register", result.request, ...)
  → callback({ ok: true, username, record, server })
```

### Step 3.8 — Server verifies register (your backend)

```javascript
// Same IdentityManager.js APIs work in Node for server-side verify
var ok = IdentityManager.verifyRegisterRequest(req);
// Rebuilds: register|username|passwordHash|pubHex|timestamp|serverNonce
// Calls: CryptoManager.verifyECC(canonical, req.signatureHex, { type:"EC", pubHex, curve })
```

**Server must:**

1. Reject if `verifyRegisterRequest` returns `false`
2. Reject if username already exists
3. Store: `username`, `passwordHash`, `pubHex`, `curve`
4. **Never** store `privHex`, `privEnc`, or raw password

---

## Part 4 — Login (full call flow)

Login has **two server round-trips** after hello:

```text
1. GET  /api/hello              → serverNonce
2. POST /api/login/password     → challenge (+ maybe fresh serverNonce)
3. POST /api/login/signin       → signed proof of device key
```

### Step 4.1 — Password step

**Request:**

```http
POST https://api.example.com/api/login/password
Content-Type: application/json

{
  "username": "alice",
  "passwordHash": "54f1503510102b99316c1ee65f708ebe226969d72b3259e17f69db4ba7000954"
}
```

**Response (example):**

```json
{
  "challenge": "challenge99887766554433221100aabbccddeeff",
  "serverNonce": "a1b2c3d4e5f6789012345678abcdef0123456789abcdef0123456789abcdef0123456789"
}
```

In step 4.1, after password login the server returns a **fresh** `serverNonce`. Client must call both:

```javascript
IdentityManager.onServerHello(res.data.serverNonce);   // new nonce for sign-in
IdentityManager.onLoginChallenge(res.data.challenge);
```

### Step 4.2 — Unlock local private key

```javascript
var signInResult = IdentityManager.signIn("alice", "secret123");
// Returns null if: wrong username, wrong password, no local record, storage missing
```

**Internal sequence:**

```text
signIn("alice", "secret123")
  → CryptoManager.seedFromEnvironment(SERVER_NONCE)
  → unlockSession("alice", "secret123")
      → loadLocal() from cc.sys.localStorage key "identity_v1"
      → recordToIdentity(record, password)
          → _decryptPrivHex(privEnc, username, password)
          → _verifyPrivMatchesPub(privHex, pubHex, curve)  ← wrong password fails here
      → _sessionIdentity = identity
  → buildSignInRequest("alice", identity)
```

### Step 4.3 — Canonical sign-in string

**Formula:**

```text
signin|{username}|{serverChallenge}|{timestamp}|{serverNonce}
```

**Real example:**

```text
signin|alice|challenge99887766554433221100aabbccddeeff|1782867013555|a1b2c3d4e5f6789012345678abcdef0123456789abcdef0123456789abcdef0123456789
```

### Step 4.4 — Sign-in POST body

**Endpoint:** `POST https://api.example.com/api/login/signin`

```json
{
  "action": "signin",
  "username": "alice",
  "pubHex": "0488f9831bde1f1ed8117e89e14a36c4557d05edff628b93a04d28d7bda8b53f...",
  "curve": "secp384r1",
  "serverChallenge": "challenge99887766554433221100aabbccddeeff",
  "timestamp": 1782867013555,
  "serverNonce": "a1b2c3d4e5f6789012345678abcdef0123456789abcdef0123456789abcdef0123456789",
  "signatureHex": "3065023100e8e7475dad6d2e6e084ce270d6d063..."
}
```

### Step 4.5 — Server response + session token

```json
{
  "sessionToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Client stores token:**

```javascript
NetworkManager.setSessionToken(res.data.sessionToken);
// Subsequent requests add header: Authorization: Bearer <token>
```

**One-liner:**

```javascript
BizApiClient.login("alice", "secret123", function(res) {
  if (res.ok) {
    cc.log("token: " + res.sessionToken);
  }
});
```

**BizApiClient.login internal sequence:**

```text
login("alice", "secret123", callback)
  → fetchHello()
  → NetworkManager.post("/api/login/password", { username, passwordHash })
  → onLoginChallenge(data.challenge)
  → IdentityManager.signIn("alice", "secret123")
  → NetworkManager.post("/api/login/signin", signInResult.request)
  → NetworkManager.setSessionToken(sessionToken)
  → callback({ ok: true, username, sessionToken, server })
```

### Step 4.6 — Server verifies sign-in

```javascript
var ok = IdentityManager.verifySignInRequest(req, storedPubHexFromDatabase);
// Also checks req.pubHex === storedPubHex if storedPubHex provided
```

---

## Part 5 — Signed user action (after login)

### Prerequisites

- `IdentityManager.signIn()` succeeded (session unlocked)
- `NetworkManager.setSessionToken()` set (for HTTPS auth header)

### Step 5.1 — Build and sign

**User text:** `"move north"`

**Canonical string (exact):**

```text
input|move north
```

**Code:**

```javascript
var packet = IdentityManager.signUserInput("alice", "move north");
// Returns null if not signed in or username mismatch
```

### Step 5.2 — Action POST body

**Endpoint:** `POST https://api.example.com/api/action`

**Headers:**

```http
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Body:**

```json
{
  "username": "alice",
  "pubHex": "0488f9831bde1f1ed8117e89e14a36c4557d05edff628b93a04d28d7bda8b53f...",
  "curve": "secp384r1",
  "text": "move north",
  "signatureHex": "306502306729338640444e85d4721957671130bc...",
  "timestamp": 1782867014000
}
```

**One-liner:**

```javascript
BizApiClient.sendAction("alice", "move north", function(res) {
  if (res.ok) { cc.log("action accepted"); }
});
```

### Step 5.3 — Server verifies

```javascript
var ok = IdentityManager.verifySignedInput(packet);
// Rebuilds: input|move north
// Looks up user's pubHex in DB, compares with packet.pubHex
// CryptoManager.verifyECC(canonical, packet.signatureHex, pubKeyHandle)
```

### Step 5.4 — Logout

```javascript
BizApiClient.logout();
// → IdentityManager.clearSession()
// → NetworkManager.clearSessionToken()
```

After logout, `signUserInput` returns `null`.

---

## Part 6 — Parameter reference (quick lookup)

### CryptoManager defaults

| Constant | Value |
|----------|-------|
| `DEFAULT_EC_CURVE` | `"secp384r1"` |
| `DEFAULT_EC_SIGN_ALG` | `"SHA384withECDSA"` |
| `DEFAULT_RSA_BITS` | `2048` |
| `DEFAULT_RSA_SIGN_ALG` | `"SHA256withRSA"` |
| `PASSWORD_ITERATIONS` | `10000` |

### IdentityManager state (module-level)

| Variable | Set by | Used in |
|----------|--------|---------|
| `SERVER_NONCE` | `onServerHello()` | register + signin canonical strings |
| `SERVER_CHALLENGE` | `onLoginChallenge()` | signin canonical string |
| `_sessionIdentity` | `signIn()` / `unlockSession()` | `signUserInput()` |

### BizApiClient endpoints (defaults)

| Key | Path |
|-----|------|
| `hello` | `/api/hello` |
| `register` | `/api/register` |
| `loginPassword` | `/api/login/password` |
| `loginSignin` | `/api/login/signin` |
| `action` | `/api/action` |
| `config` | `/api/config` |

### NetworkManager callback result shape

Every request callback receives:

```javascript
{
  ok: true,           // HTTP 2xx
  status: 200,        // HTTP status code
  data: { ... },      // parsed JSON or raw string
  raw: "...",         // response text
  error: null,        // error message if !ok
  code: "OK",         // "OK", "TIMEOUT", "NETWORK_ERROR", "UNAUTHORIZED", etc.
  url: "https://..."
}
```

---

## Part 7 — Manual step-by-step (no HTTPS wrapper)

Use this when testing crypto **without** a server, or when building your own HTTP layer.

```javascript
// --- Setup ---
IdentityManager.init();
IdentityManager.onServerHello("a1b2c3d4e5f6789012345678abcdef0123456789abcdef0123456789abcdef0123456789");

// --- Register ---
var reg = IdentityManager.register("alice", "secret123");
// reg.record  → saved in cc.sys.localStorage
// reg.request → send to your server

// --- Login ---
IdentityManager.onLoginChallenge("challenge99887766554433221100aabbccddeeff");
var login = IdentityManager.signIn("alice", "secret123");
// login.request → send to your server
// session now unlocked

// --- Sign action ---
var packet = IdentityManager.signUserInput("alice", "move north");
// packet → send to your server

// --- Logout ---
IdentityManager.clearSession();
```

---

## Part 8 — Low-level CryptoManager examples

### Hash

```javascript
CryptoManager.sha256("hello world");
// "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2ef3329"

CryptoManager.sha384("hello world");
// 96 hex chars
```

### Generate + sign + verify (minimal)

```javascript
CryptoManager.initialize();
CryptoManager.seedFromEnvironment("00112233445566778899aabbccddeeff");

var kp = CryptoManager.generateECC("secp384r1");
var message = "test message";
var sig = CryptoManager.signECC(message, kp);  // default SHA384withECDSA

var pubOnly = {
  type: "EC",
  curve: "secp384r1",
  pubHex: kp.pubHex
};
var valid = CryptoManager.verifyECC(message, sig, pubOnly);  // true
```

### PEM roundtrip

```javascript
var kp = CryptoManager.generateECC("secp384r1");
var pem = CryptoManager.exportPublicPEM(kp);
var loaded = CryptoManager.loadPublicKey(pem);
CryptoManager.verifyECC("test", sig, loaded);  // true
```

---

## Part 9 — Common mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Skip `cengine-bootstrap.js` | `navigator is not defined` on load | Load bootstrap first |
| Skip `onServerHello` before register | Empty `serverNonce` in signature | Always fetch hello first |
| Sign JSON object directly | Server verify fails | Use canonical pipe string |
| Call `signUserInput` before `signIn` | Returns `null` | Login first |
| Wrong password on login | Old code: session set anyway; fixed: returns `null` | Use correct password |
| Send `privHex` to server | Key stolen | Send only `pubHex` |
| Reorder canonical fields | Verify fails | Exact order in Part 3/4/5 |
| Mix jsbn + jsrsasign stacks | Conflicting globals | Pick one stack |

---

## Part 10 — Verify your understanding (checklist)

Run the smoke test:

```bash
node jsrsasign/docs/examples/test-smoke.js
```

You should see 13 tests pass. Then answer:

1. What is `passwordHash` for `alice` / `secret123`?  
   → `54f1503510102b99316c1ee65f708ebe226969d72b3259e17f69db4ba7000954`

2. What three things does the server store at registration?  
   → `username`, `passwordHash`, `pubHex` (+ `curve`)

3. What canonical string is signed for `"move north"`?  
   → `input|move north`

4. What algorithm signs user identity keys?  
   → `SHA384withECDSA` on curve `secp384r1`

5. Where does the private key live after register?  
   → `privEnc` in `cc.sys.localStorage`, key `"identity_v1"`

---

## Part 11 — Server-side verification (Node.js)

The **same verify functions** run on the server. You never need the client's private key — only `pubHex` from your database.

### Files

| File | Purpose |
|------|---------|
| [`examples/ServerAuth.js`](./examples/ServerAuth.js) | Server handlers: hello, register, login, action |
| [`examples/example-server-verify.js`](./examples/example-server-verify.js) | Full step-by-step walkthrough with console output |
| [`examples/test-server-smoke.js`](./examples/test-server-smoke.js) | Automated server tests |

### Run the walkthrough

```bash
node jsrsasign/docs/examples/example-server-verify.js
```

You will see 11 numbered steps: hello → register → verify → login → sign-in → action → tamper rejection.

### Server API reference

```javascript
ServerAuth.init();

// GET /api/hello
var hello = ServerAuth.createHello();
// → { serverNonce: "96003f3c...", serverTime: 1782867339091 }

// POST /api/register
var regRes = ServerAuth.handleRegister(req);
// → { ok: true, code: "REGISTER_OK", username, keyId, canonical }

// POST /api/login/password
var pwRes = ServerAuth.handleLoginPassword({
  username: "alice",
  passwordHash: "54f1503510102b99316c1ee65f708ebe226969d72b3259e17f69db4ba7000954"
});
// → { ok: true, challenge: "23898e2c...", serverNonce: "14fc2488..." }
// IMPORTANT: serverNonce is NEW — client must call onServerHello(pwRes.serverNonce)

// POST /api/login/signin
var siRes = ServerAuth.handleLoginSignin(signInReq);
// → { ok: true, sessionToken: "08c6da64...", canonical: "signin|alice|..." }

// POST /api/action  (Authorization: Bearer <sessionToken>)
var actRes = ServerAuth.handleAction(packet, sessionToken);
// → { ok: true, code: "ACTION_OK", text: "move north", canonical: "input|move north" }
```

### What the server stores (database row)

After successful register:

```json
{
  "username": "alice",
  "passwordHash": "54f1503510102b99316c1ee65f708ebe226969d72b3259e17f69db4ba7000954",
  "pubHex": "04d0cf4ade8932584bb3f7fb7c9536415cc6bac73d8e09234aa9a9cbcd9c7944496a04da441115608d746e5e930b174b14d2ecc701d08ded6c7e8e5a26326069b4c248e5431569101b48007656bcd5d3f4d158b65599235c0d681c9a25fcb5f867",
  "curve": "secp384r1",
  "keyId": "6737b51f644769cb4bf211b14df878ac6510a1527523ce3f58527c16f6209c099f91c2266fb571b178060e8a5b78b260",
  "createdAt": 1782867339928
}
```

**Never store:** `privHex`, `privEnc`, raw password.

### Server verify flow (step by step)

```text
1. createHello()
      → save active serverNonce (64 hex chars)

2. handleRegister(req)
      → rebuild: register|username|passwordHash|pubHex|timestamp|serverNonce
      → IdentityManager.verifyRegisterRequest(req)
      → mark serverNonce spent
      → INSERT user row

3. handleLoginPassword({ username, passwordHash })
      → compare passwordHash to DB (secureCompare)
      → createLoginChallenge(username)  → 48 hex chars
      → issue FRESH serverNonce
      → return { challenge, serverNonce }

4. handleLoginSignin(req)
      → rebuild: signin|username|serverChallenge|timestamp|serverNonce
      → IdentityManager.verifySignInRequest(req, storedPubHex)
      → mark challenge + serverNonce spent
      → return sessionToken

5. handleAction(packet, sessionToken)
      → rebuild: input|text
      → compare packet.pubHex to stored pubHex
      → IdentityManager.verifySignedInput(packet)
      → accept action
```

### Low-level verify only (no ServerAuth wrapper)

If you already have your own HTTP framework, call these directly:

```javascript
// After loading jsrsasign + CryptoManager + IdentityManager in Node:
CryptoManager.initialize();

var okRegister = IdentityManager.verifyRegisterRequest(req);
var okSignIn   = IdentityManager.verifySignInRequest(req, storedPubHex);
var okAction   = IdentityManager.verifySignedInput(packet);
```

Each returns `true` or `false`.

### Server error codes (ServerAuth)

| code | Meaning |
|------|---------|
| `REGISTER_OK` | User created |
| `LOGIN_PASSWORD_OK` | Password accepted, challenge issued |
| `LOGIN_SIGNIN_OK` | Signature valid, session issued |
| `ACTION_OK` | Action signature valid |
| `VERIFY_FAILED` | Signature invalid (tampered payload) |
| `BAD_PASSWORD` | passwordHash mismatch |
| `BAD_NONCE` | serverNonce does not match hello |
| `NONCE_REUSED` | Replay detected |
| `BAD_CHALLENGE` | Wrong or expired challenge |
| `PUBKEY_MISMATCH` | packet.pubHex ≠ stored pubHex |
| `USER_EXISTS` | Duplicate registration |

### Express.js route sketch (optional)

```javascript
app.get("/api/hello", function(req, res) {
  res.json(ServerAuth.createHello());
});

app.post("/api/register", function(req, res) {
  var result = ServerAuth.handleRegister(req.body);
  res.status(result.ok ? 201 : 400).json(result);
});

app.post("/api/login/password", function(req, res) {
  var result = ServerAuth.handleLoginPassword(req.body);
  res.status(result.ok ? 200 : 401).json(result);
});

app.post("/api/login/signin", function(req, res) {
  var result = ServerAuth.handleLoginSignin(req.body);
  res.status(result.ok ? 200 : 401).json(result);
});

app.post("/api/action", function(req, res) {
  var token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  var result = ServerAuth.handleAction(req.body, token);
  res.status(result.ok ? 200 : 403).json(result);
});
```

### Production notes for server developers

1. Replace in-memory `_users` with your database.
2. Replace `passwordHash` storage with bcrypt/Argon2 — the client transport hash is a **minimum**, not final password storage.
3. Persist spent nonces/challenges in Redis with TTL to prevent replay across server restarts.
4. Load the same scripts in Node: `cengine-bootstrap.js` → `jsrsasign-all-min.js` → `CryptoManager.js` → `IdentityManager.js` → `ServerAuth.js`.

---

## See also

| Doc | Topic |
|-----|-------|
| [01-getting-started.md](./01-getting-started.md) | Load order, first hash |
| [04-auth-flows.md](./04-auth-flows.md) | Sequence diagrams |
| [06-https-networking.md](./06-https-networking.md) | XMLHttpRequest details |
| [AUDIT.md](./AUDIT.md) | Runtime blockers, production checklist |
| [examples/CENGINE.md](./examples/CENGINE.md) | Device integration |
| [examples/example-server-verify.js](./examples/example-server-verify.js) | Server-side verify walkthrough |
| [examples/ServerAuth.js](./examples/ServerAuth.js) | Server handler module |
