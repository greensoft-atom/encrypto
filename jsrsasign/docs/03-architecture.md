# 03 — Crypto Architecture

Design the crypto subsystem **before** scattering `jsrsasign` calls through biz code. This document turns the discussion in [discussion_02.md](./discussion_02.md) into a concrete layout.

---

## Layer model

```text
Biz Logic (views, UI, workflows)
        │
        ▼
BizApiClient            ← HTTPS + auth orchestration (optional)
        │
        ├── NetworkManager     ← XMLHttpRequest, TLS via CEngine2d runtime
        │
        ▼
IdentityManager          ← users, sessions, registration, login
        │
        ▼
CryptoManager            ← hashes, keys, sign, verify, encode
        │
        ▼
jsrsasign-all-min.js     ← implementation detail (hidden)
```

### Separation of concerns

| Layer | Knows about | Must NOT know about |
|-------|-------------|---------------------|
| Biz Logic | `IdentityManager` public API | PEM format, curves, jsrsasign |
| IdentityManager | Users, key storage, auth payloads | BigInteger, ASN.1 |
| CryptoManager | Algorithms, keys as opaque handles | Usernames, sessions |
| jsrsasign | Everything crypto | Your biz app |

> **Cryptography is not authentication.**  
> Signing proves key possession and message integrity. Sessions, rate limits, and account state belong in `IdentityManager` / server logic.

---

## Directory structure

```text
src/crypto/
    jsrsasign-all-min.js       ← vendor (never edit)

    CryptoManager.js           ← public crypto API (facade)

    IdentityManager.js         ← registration / login / signed input

    NetworkManager.js          ← HTTPS via XMLHttpRequest (no Java code)
    BizApiClient.js           ← register / login / action API client

    # Optional future split (when CryptoManager grows):
    hash/Hash.js
    rsa/RSA.js
    ecc/ECC.js
    pem/PEM.js
    password/Password.js
    encoding/Base64.js
    random/Random.js
```

Nothing outside `src/crypto/` imports `jsrsasign`.

---

## CryptoManager facade API

Expose ~30 stable methods instead of hundreds of jsrsasign symbols:

```javascript
CryptoManager.initialize()
CryptoManager.version()

// Random
CryptoManager.randomBytes(n)
CryptoManager.seedFromEnvironment(extraHex)

// Hash
CryptoManager.sha256(text)
CryptoManager.sha384(text)
CryptoManager.sha512(text)
CryptoManager.hmacSHA256(key, text)

// Keys
CryptoManager.generateRSA(bits)
CryptoManager.generateECC(curve)
CryptoManager.loadPrivateKey(pem, pass)
CryptoManager.loadPublicKey(pem)
CryptoManager.exportPrivatePEM(keyHandle, format)
CryptoManager.exportPublicPEM(keyHandle, format)

// RSA
CryptoManager.signRSA(message, keyHandle, alg)
CryptoManager.verifyRSA(message, sigHex, keyHandle, alg)

// ECC
CryptoManager.signECC(message, keyHandle, alg)
CryptoManager.verifyECC(message, sigHex, keyHandle, alg)

// Password (server-side or local vault)
CryptoManager.hashPassword(password, salt, iterations)
CryptoManager.verifyPassword(password, storedHash)

// Encoding
CryptoManager.base64Encode(str)
CryptoManager.base64Decode(b64)
CryptoManager.hexEncode(bytes)
CryptoManager.hexDecode(hex)
CryptoManager.secureCompare(a, b)
```

**Not implemented (by design):** `encryptRSA` / `decryptRSA`. jsrsasign 11+ removed RSA PKCS#1 v1.5 encryption (Marvin attack). Use digital signatures for auth/integrity; use AES for bulk data encryption when needed.

Implementation: [examples/CryptoManager.js](./examples/CryptoManager.js).

---

## Key handle format

Internal key handles are plain objects — no jsrsasign types leak to biz code:

```javascript
// RSA handle
{
  type: "RSA",
  bits: 2048,
  private: true,          // or false for public-only
  _prv: <internal>,       // RSAKey object — treat as opaque
  _pub: <internal>
}

// EC handle
{
  type: "EC",
  curve: "secp384r1",
  privHex: "...",
  pubHex: "04...",
  private: true,
  _prv: <internal>,
  _pub: <internal>
}
```

Biz code passes handles returned by `generateECC` / `loadPublicKey` — never constructs them manually.

---

## Algorithm registry (future-proof)

Reference algorithms by name, not hard-coded implementation:

```javascript
var ALG = {
  USER_IDENTITY:  { type: "EC",  curve: "secp384r1", sign: "SHA384withECDSA" },
  SERVER_CONFIG:  { type: "RSA", bits: 2048,         sign: "SHA256withRSA" },
  SAVE_INTEGRITY: { hash: "sha256" }
};

function signWithProfile(message, keyHandle, profile) {
  if (profile.type === "EC") {
    return CryptoManager.signECC(message, keyHandle, profile.sign);
  }
  return CryptoManager.signRSA(message, keyHandle, profile.sign);
}
```

When you upgrade algorithms, change the registry — not every call site.

---

## IdentityManager

Sits above `CryptoManager` and understands **users**:

```text
IdentityManager
 ├── register(username, password)
 ├── signIn(username, password)
 ├── logout() / clearSession()
 ├── signUserAction(actionObject)
 ├── verifyUserAction(packet)      // server-side
 ├── getSession()
 └── getPublicKeyId()
```

See [04-auth-flows.md](./04-auth-flows.md) and [examples/IdentityManager.js](./examples/IdentityManager.js).

---

## Key storage (KeyStore)

Never scatter keys across random files.

```text
KeyStore/
  metadata.json
  public.pem          (optional — can derive from handle)
  private.enc         (encrypted private key / handle fields)
```

`metadata.json` example:

```json
{
  "version": 1,
  "algorithm": "ECC384",
  "curve": "secp384r1",
  "keyId": "usr-a1b2c3",
  "publicKeyFingerprint": "sha384hex...",
  "created": "2026-07-01T12:00:00Z"
}
```

On device, store encrypted private material in `cc.sys.localStorage` or native secure storage — see IdentityManager.

---

## Use-case matrix (biz app)

| Purpose | Recommended |
|---------|-------------|
| Verify server messages | RSA-2048 or ECDSA P-384 |
| Sign server updates | RSA-2048 or ECDSA P-384 |
| Verify downloadable assets | Signature over manifest hash |
| Verify config files | Embedded public key + signature |
| Hash save files | SHA-256 |
| User registration proof | ECDSA P-384 + password hash on server |
| User action authenticity | ECDSA sign canonical JSON |

### Bulk data pattern

Do **not** RSA-encrypt large save files.

```text
Random AES-256 key
    │
    ├─► AES encrypt biz data
    │
    └─► RSA/EC sign hash of ciphertext (or sign manifest)
```

jsrsasign includes AES via CryptoJS inside the bundle; add an AES wrapper to CryptoManager only when you need it.

---

## Testing strategy

1. **Smoke test** — `node docs/examples/test-smoke.js` (no CEngine2d required)
2. **Unit tests** — canonical string + sign + verify roundtrips
3. **Integration** — register → login → sign action against mock server
4. **Never skip** — tampered message must fail verify

---

## Migration from jsbn/CEngineSec

This repo also contains a lighter **jsbn** stack (`jsbn/cengine-sec.js`). Comparison:

| | jsbn/CEngineSec | jsrsasign/CryptoManager |
|--|---------------|-------------------------|
| Size | Smaller (many files) | One minified bundle |
| PEM / X.509 | Limited | Full KEYUTIL support |
| Algorithms | RSA + P-384 ECDSA | RSA, EC, DSA, CMS, JWT, … |
| API style | Custom hex keys | PEM + handles |

Pick one stack per project; do not mix both in the same app binary without strong reason.

---

## Next

- [04-auth-flows.md](./04-auth-flows.md) — registration and login sequences
- [examples/CENGINE.md](./examples/CENGINE.md) — wire it into CEngine2d 1.5
