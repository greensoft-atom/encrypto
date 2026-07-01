# Beginner guide — cryptography for CEngine2d (jsbn / CEngineSec)

This guide is for developers **new to encrypt/decrypt, sign/verify, keys, PEM, and seeding**. It walks through the **jsbn stack** used in the APK with **real field names, sizes, and example values**.

**Server code (Node.js 12+):** [`server/server.js`](server/server.js) — see [Server setup](#server-setup-nodejs-12) below.

**Integration reference:** [`CEngine.md`](CEngine.md)

---

## Part 1 — Concepts in plain language

### Encrypt vs decrypt (secrecy)

| Term | Meaning | Who has what |
|------|---------|--------------|
| **Encrypt** | Turn readable text into unreadable ciphertext | Sender uses the **public** key |
| **Decrypt** | Turn ciphertext back to readable text | Only holder of **private** key can decrypt |

**Analogy:** A mailbox with a slot anyone can drop mail into (encrypt with public key), but only you have the key to open it (decrypt with private key).

**In this project:** RSA-2048 encrypt/decrypt. The game embeds the server’s **public** `n` + `e`. The server keeps **private** PEM on the machine — never in the APK.

```javascript
// Client (APK) — encrypt only needs n + e (hex strings)
var cipherHex = CEngineSec.rsaEncrypt(serverNHex, "10001", "player42|token");
// cipherHex = 512 hex characters (2048 bits)

// Server (Node.js) — decrypt with private key (see server/server.js)
```

**Limits:** Max plaintext ~**245 bytes** per RSA-2048 block with PKCS#1 padding.

---

### Sign vs verify (authenticity)

| Term | Meaning | Who has what |
|------|---------|--------------|
| **Sign** | Create a proof that *you* wrote a message | Signer uses **private** key |
| **Verify** | Check the proof matches the message and **public** key | Anyone with **public** key can verify |

**Analogy:** A wax seal on a letter. You press the seal (sign with private key). Anyone who knows your seal pattern (public key) can check it was not tampered with (verify).

**Important:** Signing is **not** encryption. The message `"move north"` is still readable. The signature proves it came from the key owner and was not changed.

**In this project:**

1. Build a **canonical string** (exact format matters).
2. Hash it with **SHA-256**.
3. **ECDSA sign** on curve **P-384** (`secp384r1`).
4. Server repeats steps 1–3 and checks the signature.

```javascript
// Client signs
var sig = CEngineSec.signUserInput(privHex, "move north");
// sig.rHex = 96 hex chars, sig.sHex = 96 hex chars

// Server verifies (same jsbn code)
CEngineSec.verifySignedInput(packet);  // true / false
```

---

### Keys — what is pubHex / privHex?

A **key pair** is two linked values:

| Key | Keep where | Format in jsbn | Length (P-384) |
|-----|------------|----------------|----------------|
| **Private** (`privHex`) | **Device only** — never send to server | Hex string (scalar) | ~96 hex chars |
| **Public** (`pubHex`) | Server + other players | Hex string, uncompressed EC point | **194 hex chars** |

**Public key shape:** always starts with `04`, then 96 hex chars of X, then 96 hex chars of Y.

**Example public key** (deterministic with test seed below):

```
04b9a3ebdde9a29ca951594d0ed3b65a831e28d3f042e5c6b9bfbcc62c9b76059ef26db481300cd672503bc05c7044f1a34f4c79e48fde350aba061b08a5b3d09b84e17ac482a9dfe03741ab3373afbee6c9dd48af99bd1a3babc823b927abea24
```

**Example private key** (same test seed — **debug only, never publish**):

```
1ea4638b09fbb976061abc7e28781cca904585ca0f76bc83d89b5451b858373a79e117303f1da37e72b7379f674dd2ed
```

One identity key pair is used for **both** ECDH (session secrets) and ECDSA (signatures).

---

### PEM — what is it and does jsbn use it?

**PEM** = text file wrapping binary key bytes between `-----BEGIN …-----` / `-----END …-----` lines. Common in OpenSSL and Node.js servers.

| Stack | Key format on wire |
|-------|-------------------|
| **jsbn (this APK)** | **Hex strings** (`pubHex`, `privHex`, `n`, `e`) — no PEM in game code |
| **jsrsasign** | PEM + X.509 (other folder in repo) |

**You do not need PEM inside the CEngine2d game.** The server may use PEM internally (Node `crypto`) for RSA private key, while the APK only gets `rsaN` + `rsaE` as hex from `/api/hello`.

Generate server RSA PEM on dev PC:

```bash
openssl genrsa -out server-private.pem 2048
openssl rsa -in server-private.pem -pubout -out server-public.pem
```

The reference Node server in [`server/server.js`](server/server.js) generates RSA keys at startup and exposes `n` + `e` as hex automatically.

---

### Seed — why randomness matters

Crypto key generation needs **unpredictable random bytes**. In CEngine2d there is no hardware RNG API in pure JS.

| Call | Purpose |
|------|---------|
| `CEngineSec.seedRandom(byteArray)` | Feed bytes into the PRNG pool **before** `createUserIdentity()` or `rsaGenerateKey()` |
| `CEngineSec.gatherEntropyBytes(32)` | Collect time / `Math.random()` / optional `cc.*` into 32 bytes |
| `CEngineSec.seedFromEnvironment(extra)` | Convenience: gather + seed |

**Production pattern:** server sends random **nonce** → client mixes `serverNonce + clientEntropy` → then generates keys.

```javascript
// After GET /api/hello returns serverNonce (64 hex chars = 32 bytes)
var serverBytes = CEngineSec.hexToBytes(serverNonceHex);
CEngineSec.seedRandom(serverBytes.concat(CEngineSec.gatherEntropyBytes(32)));
var identity = CEngineSec.createUserIdentity();
```

**Test-only fixed seed** (same keys every run — for debugging):

```javascript
var TEST_SEED = [
  0x3a, 0xf2, 0x91, 0x0c, 0x55, 0xe8, 0x17, 0x6b,
  0x02, 0x44, 0xac, 0x81, 0xd9, 0x3f, 0x70, 0x28,
  0xce, 0x11, 0x9a, 0x64, 0x05, 0xb2, 0xf8, 0x73,
  0x1d, 0x4e, 0x86, 0xc0, 0x39, 0xa7, 0x52, 0x6d
];
CEngineSec.seedRandom(TEST_SEED);
```

---

## Part 2 — What the APK implements

| Feature | Algorithm | Client function |
|---------|-----------|-----------------|
| Password on wire | `SHA256(username + "|" + password)` | `CEngineSec.hashPassword` |
| User register / sign-in | ECDSA over SHA-256 of canonical string | `buildRegisterRequest`, `buildSignInRequest` |
| Signed chat / commands | ECDSA over `input\|{text}` | `signUserInput`, `wrapSignedInput` |
| Session key agreement | ECDH P-384, shared X coordinate | `ecdhSharedSecretX` |
| Encrypt small secret to server | RSA-2048 PKCS#1 | `rsaEncrypt` |

**Do not mix** with jsrsasign’s SHA384withECDSA on the same server API.

---

## Part 3 — Script load order (once at startup)

Load these **11 files in order** before any crypto call:

```
jsbn.js → jsbn2.js → prng4.js → rng.js → sha256.js → rsa.js → rsa2.js → ec.js → sec.js → ecdsa.js → cengine-sec.js
```

Global API: **`CEngineSec`** (alias `CocosSec`).

---

## Part 4 — Exact parameters and sizes

| Field | Example | Length / notes |
|-------|---------|----------------|
| `sha256("hello")` | `2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824` | 64 hex |
| `hashPassword("alice","secret123")` | `54f1503510102b99316c1ee65f708ebe226969d72b3259e17f69db4ba7000954` | 64 hex |
| `pubHex` | starts with `04` | **194** hex |
| `privHex` | secret scalar | ~96 hex |
| `signature.rHex` / `signature.sHex` | each half of ECDSA | **96** hex each |
| `signatureHex` | `rHex + sHex` | **192** hex |
| `serverNonce` | server random | recommend **64** hex (32 bytes) |
| `serverChallenge` | sign-in random | recommend **64** hex |
| `timestamp` | `new Date().getTime()` | number, e.g. `1700000000000` |
| RSA `n` | modulus | **512** hex (2048-bit) |
| RSA `e` | exponent | `10001` (65537) |
| RSA ciphertext | encrypted output | **512** hex |

---

## Part 5 — Canonical strings (server must match exactly)

Fields joined with **pipe** `|` — no spaces, no URL encoding inside the canonical string.

### Register

```
register|{username}|{passwordHash}|{pubHex}|{timestamp}|{serverNonce}
```

**Worked example** (fixed timestamp `1700000000000`, test seed identity):

```
register|alice|54f1503510102b99316c1ee65f708ebe226969d72b3259e17f69db4ba7000954|04b9a3ebdde9a29ca951594d0ed3b65a831e28d3f042e5c6b9bfbcc62c9b76059ef26db481300cd672503bc05c7044f1a34f4c79e48fde350aba061b08a5b3d09b84e17ac482a9dfe03741ab3373afbee6c9dd48af99bd1a3babc823b927abea24|1700000000000|abc123nonce
```

Signature over this string (via SHA-256 + ECDSA):

```
b71d4f9482658d72941a751f020a310df1fdb21a9e20900aaa2b4e9aa10484445ba36fb95ffb34900f9531e0aa8c0faff19f51b51403f4b64aa3a69d450dfc1d141ed7160716d4d1693638cd454b729ff5ed150555eca500105928338a7faf75
```

### Sign-in

```
signin|{username}|{serverChallenge}|{timestamp}|{serverNonce}
```

**Example:**

```
signin|alice|challenge99|1700000000000|nonce88
```

Signature:

```
26b0dce4afddcc47dc09cbdfd0f71e0047ecb631b6c9e908445bee1fe176891d1b3c7c9eb406dc40f4fc3d546e581232921fad7d62bfe039221920f13d7c576157467db9b49213cb75e234d26d46d7c0bb70130aa7371d55e8c570c10d3e8f7f
```

### Signed user input

```
input|{userText}
```

**Example:**

```
input|move north
```

Signature:

```
1a4e3ff57cfe716ea935d7f2dc419a8455b745b28d6fe428c6b70a9fa6eec984088f1ad0debe7bd510db72023044eebf0dafc2899dd0c0c2f3c09918e89a7e4f776eddaf1e3c1488f31bc0d3147a8af0835dafa107d297455aefafc4b44d67f6
```

---

## Part 6 — Step-by-step call flows

### Flow A — First launch (register)

```
┌────────┐                              ┌────────┐
│  APK   │                              │ Server │
└───┬────┘                              └───┬────┘
    │  GET /api/hello                       │
    │──────────────────────────────────────>│
    │  { serverNonce, rsaN, rsaE }          │
    │<──────────────────────────────────────│
    │                                       │
    │  seedRandom(serverNonce + clientEntropy)
    │  createUserIdentity()                 │
    │  buildRegisterRequest(...)            │
    │                                       │
    │  POST /api/register  (JSON body)    │
    │──────────────────────────────────────>│
    │  verify signature, store pubHex     │
    │  { ok: true }                         │
    │<──────────────────────────────────────│
    │  saveUserLocal(privHex + pubHex)      │
```

**Step 1 — Client:** `GET /api/hello`

Server response example:

```json
{
  "ok": true,
  "serverNonce": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678",
  "rsaN": "9940dfd4823bc03760abe71699c66271f54960d2...",
  "rsaE": "10001",
  "curve": "secp384r1"
}
```

**Step 2 — Client:** seed + create identity + build request

```javascript
UserAuth.onServerHello(response.serverNonce);

var identity = CEngineSec.createUserIdentity();
var req = CEngineSec.buildRegisterRequest(
  "alice",
  "secret123",
  identity,
  UserAuth.SERVER_NONCE
);

CEngineSec.saveUserLocal("user_identity_v1",
  CEngineSec.identityToStorage("alice", identity));

// POST JSON.stringify(req) to /api/register
```

**Step 3 — Register JSON body** (shape; `timestamp` and `signatureHex` change each call):

```json
{
  "action": "register",
  "username": "alice",
  "passwordHash": "54f1503510102b99316c1ee65f708ebe226969d72b3259e17f69db4ba7000954",
  "pubHex": "04b9a3ebdde9a29ca951594d0ed3b65a831e28d3f042e5c6b9bfbcc62c9b76059ef26db481300cd672503bc05c7044f1a34f4c79e48fde350aba061b08a5b3d09b84e17ac482a9dfe03741ab3373afbee6c9dd48af99bd1a3babc823b927abea24",
  "timestamp": 1700000000000,
  "serverNonce": "abc123nonce",
  "signature": {
    "rHex": "b71d4f9482658d72941a751f020a310df1fdb21a9e20900aaa2b4e9aa1048444",
    "sHex": "5ba36fb95ffb34900f9531e0aa8c0faff19f51b51403f4b64aa3a69d450dfc1d141ed7160716d4d1693638cd454b729ff5ed150555eca500105928338a7faf75"
  },
  "signatureHex": "b71d4f9482658d72941a751f020a310df1fdb21a9e20900aaa2b4e9aa10484445ba36fb95ffb34900f9531e0aa8c0faff19f51b51403f4b64aa3a69d450dfc1d141ed7160716d4d1693638cd454b729ff5ed150555eca500105928338a7faf75"
}
```

**Step 4 — Server:** `CEngineSec.verifyRegisterRequest(body)` → store `username`, `passwordHash`, `pubHex`.

---

### Flow B — Returning user (sign-in)

```
┌────────┐                              ┌────────┐
│  APK   │                              │ Server │
└───┬────┘                              └───┬────┘
    │  GET /api/signin/start?username=alice │
    │──────────────────────────────────────>│
    │  { serverNonce, serverChallenge }     │
    │<──────────────────────────────────────│
    │                                       │
    │  loadUserLocal()                      │
    │  buildSignInRequest(...)              │
    │                                       │
    │  POST /api/signin                     │
    │──────────────────────────────────────>│
    │  verify sig + pubHex match            │
    │  { sessionToken }                     │
    │<──────────────────────────────────────│
```

**Step 1 — Client:** request challenge

```
GET /api/signin/start?username=alice
```

Response:

```json
{
  "ok": true,
  "username": "alice",
  "serverNonce": "f0e1d2c3...",
  "serverChallenge": "9a8b7c6d..."
}
```

**Step 2 — Client:**

```javascript
UserAuth.SERVER_NONCE = response.serverNonce;
UserAuth.SERVER_CHALLENGE = response.serverChallenge;

CEngineSec.seedFromEnvironment(CEngineSec.hexToBytes(UserAuth.SERVER_NONCE));

var identity = CEngineSec.loadUserLocal("user_identity_v1");
var req = CEngineSec.buildSignInRequest(
  "alice",
  identity,
  UserAuth.SERVER_CHALLENGE,
  UserAuth.SERVER_NONCE
);
// POST JSON.stringify(req)
```

**Step 3 — Sign-in JSON body:**

```json
{
  "action": "signin",
  "username": "alice",
  "pubHex": "04b9a3ebdde9a29ca951594d0ed3b65a831e28d3f042e5c6b9bfbcc62c9b76059ef26db481300cd672503bc05c7044f1a34f4c79e48fde350aba061b08a5b3d09b84e17ac482a9dfe03741ab3373afbee6c9dd48af99bd1a3babc823b927abea24",
  "serverChallenge": "challenge99",
  "timestamp": 1700000000000,
  "serverNonce": "nonce88",
  "signatureHex": "26b0dce4afddcc47dc09cbdfd0f71e0047ecb631b6c9e908445bee1fe176891d1b3c7c9eb406dc40f4fc3d546e581232921fad7d62bfe039221920f13d7c576157467db9b49213cb75e234d26d46d7c0bb70130aa7371d55e8c570c10d3e8f7f"
}
```

**Step 4 — Server checks:**

1. `pendingChallenges[username]` matches `serverChallenge` + `serverNonce`
2. `body.pubHex === stored.pubHex`
3. `CEngineSec.verifySignInRequest(body)`
4. Return `sessionToken`

---

### Flow C — Signed game input (after sign-in)

```javascript
var packet = UserAuth.signInput("alice", "move north");
// POST /api/game/input
// Header: Authorization: Bearer <sessionToken>
```

**JSON body:**

```json
{
  "username": "alice",
  "pubHex": "04b9a3ebdde9a29ca951594d0ed3b65a831e28d3f042e5c6b9bfbcc62c9b76059ef26db481300cd672503bc05c7044f1a34f4c79e48fde350aba061b08a5b3d09b84e17ac482a9dfe03741ab3373afbee6c9dd48af99bd1a3babc823b927abea24",
  "text": "move north",
  "signatureHex": "1a4e3ff57cfe716ea935d7f2dc419a8455b745b28d6fe428c6b70a9fa6eec984088f1ad0debe7bd510db72023044eebf0dafc2899dd0c0c2f3c09918e89a7e4f776eddaf1e3c1488f31bc0d3147a8af0835dafa107d297455aefafc4b44d67f6",
  "timestamp": 1700000001000
}
```

**Server:** lookup user → confirm `pubHex` → `CEngineSec.verifySignedInput(body)`.

---

### Flow D — RSA encrypt small login token (optional)

After ECDH, encrypt a short string with server RSA public key:

```javascript
var cipherHex = CEngineSec.rsaEncrypt(serverNHex, "10001", "alice|session");
// POST { "loginCipher": cipherHex } to /api/login/rsa-decrypt (demo endpoint)
```

Deterministic test (TEST_SEED RSA key):

- `n` prefix: `9940dfd4823bc03760abe71699c66271`
- `e`: `10001`
- Plaintext `"hello cengine2d"` encrypts to 512 hex chars, decrypts back identically.

---

### Flow E — ECDH session secret (optional)

```javascript
var alice = CEngineSec.ecdhGenerateKeyPair();
// send alice.pubHex to server; server has bob.privHex + alice.pubHex

var sharedX = CEngineSec.ecdhSharedSecretX(alice.privHex, serverPubHex);
// sharedX = 96 hex chars — both sides get the same value
```

Use `sharedX` as input to your own KDF / session token derivation (define the same rule on server).

---

## Part 7 — Client module (copy into game)

See [`example-auth-scene.js`](example-auth-scene.js). Minimal wiring:

```javascript
// 1) Load 11 jsbn scripts (see Part 3)
// 2) Include example-auth-scene.js

UserAuth.init();

// On network ready — register path
httpGet(BASE_URL + "/api/hello", function(res) {
  UserAuth.onServerHello(res.serverNonce);
  UserAuth.register("alice", "MyPassword123");
});

// Returning user
httpGet(BASE_URL + "/api/signin/start?username=alice", function(res) {
  UserAuth.SERVER_NONCE = res.serverNonce;
  UserAuth.SERVER_CHALLENGE = res.serverChallenge;
  UserAuth.signIn("alice");
});

// After sign-in, store sessionToken from server response
UserAuth.signInput("alice", "move north");
```

Replace `httpGet` / `sendToServer` with your CEngine2d `XMLHttpRequest` wrapper.

---

## Part 8 — Server setup (Node.js 12)

### Files

| File | Role |
|------|------|
| [`server/load-cengine-sec.js`](server/load-cengine-sec.js) | Loads same jsbn scripts as APK into Node VM |
| [`server/server.js`](server/server.js) | HTTP API — verify register / sign-in / signed input |
| [`server/test-server-smoke.js`](server/test-server-smoke.js) | Offline tests with fixed vectors |

### Run

```bash
cd jsbn/server
node test-server-smoke.js
node server.js
```

Server listens on **http://127.0.0.1:3000** (override with `PORT` env var).

### Why load jsbn on the server?

`CEngineSec.verifyRegisterRequest` uses the **exact same** canonical strings and SHA-256 + ECDSA P-384 as the APK. Loading jsbn in Node avoids hash/curve mismatch bugs.

### Server verification (core logic)

From `server.js` — equivalent to what your production backend must do:

```javascript
var CEngineSec = require("./load-cengine-sec.js").loadCEngineSec();

// Register
if (!CEngineSec.verifyRegisterRequest(body)) {
  return reject("signature verification failed");
}
users[body.username] = {
  passwordHash: body.passwordHash,
  pubHex: body.pubHex
};

// Sign-in
if (body.pubHex !== users[body.username].pubHex) {
  return reject("pubHex mismatch");
}
if (!CEngineSec.verifySignInRequest(body)) {
  return reject("signature verification failed");
}

// Signed input
if (body.pubHex !== users[body.username].pubHex) {
  return reject("pubHex mismatch");
}
if (!CEngineSec.verifySignedInput(body)) {
  return reject("signature verification failed");
}
```

### Node.js 12 notes

- Uses only built-in modules: `crypto`, `http`, `url`, `fs`, `vm`.
- No `npm install` required.
- RSA decrypt uses `crypto.privateDecrypt` with `RSA_PKCS1_PADDING` (matches jsbn PKCS#1 v1.5 encrypt).

---

## Part 9 — Common mistakes

| Mistake | Result |
|---------|--------|
| Wrong script load order | `ReferenceError` at startup |
| Skip `seedRandom` before keygen | Weak or repeating keys |
| Server uses SHA384withECDSA | All signatures fail |
| Change canonical string format | Signatures fail |
| Send `privHex` to server | **Critical security breach** |
| Call `ecdsaVerify` every frame on device | Game freezes (seconds per verify) |
| Reuse `serverNonce` | Replay attacks |
| Trust `username` without checking `pubHex` | Impersonation |

---

## Part 10 — Verify your build

```bash
# Client library (dev PC)
node jsbn/test-smoke.js

# Server verification (dev PC)
node jsbn/server/test-server-smoke.js
```

In a debug APK build:

```javascript
CEngineSec.seedRandom(TEST_SEED);  // from Part 1
var kp = CEngineSec.ecdhGenerateKeyPair();
cc.log(kp.pubHex.substring(0, 64));
// expect: 04b9a3ebdde9a29ca951594d0ed3b65a831e28d3f042e5c6b9bfbcc62c9b7605
```

---

## Quick API cheat sheet

```javascript
CEngineSec.hashPassword("alice", "secret123")
CEngineSec.createUserIdentity()
CEngineSec.buildRegisterRequest(user, pass, identity, serverNonceHex)
CEngineSec.buildSignInRequest(user, identity, challengeHex, nonceHex)
CEngineSec.signUserInput(privHex, "move north")
CEngineSec.wrapSignedInput(user, pubHex, text, sig)
CEngineSec.rsaEncrypt(nHex, "10001", plaintext)
CEngineSec.ecdhSharedSecretX(privHex, peerPubHex)
CEngineSec.saveUserLocal(key, record)
CEngineSec.loadUserLocal(key)
```

Server mirrors verify calls: `verifyRegisterRequest`, `verifySignInRequest`, `verifySignedInput`.
