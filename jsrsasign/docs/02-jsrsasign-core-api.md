# 02 — jsrsasign Core API Cheat Sheet

Direct API reference for when you work inside `CryptoManager` or need to debug. Biz code should prefer the facade in [examples/CryptoManager.js](./examples/CryptoManager.js).

---

## Main objects

| Object | Purpose |
|--------|---------|
| `KEYUTIL` | Load/generate/export PEM and PKCS keys |
| `KJUR.crypto.MessageDigest` | SHA-1/224/256/384/512, MD5, RIPEMD-160 |
| `KJUR.crypto.Signature` | RSA and ECDSA sign/verify |
| `KJUR.crypto.Cipher` | RSA encrypt/decrypt (small payloads only) |
| `KJUR.crypto.Util` | Random bytes, algorithm helpers |
| `RSAKey` | Low-level RSA (legacy samples) |

Internal stack:

```
Your code → KJUR.crypto.* → BigInteger math → JavaScript arrays
```

No native code. Pure JS — ideal for SpiderMonkey, slow for bulk RSA encryption.

---

## Hashing

```javascript
// One-shot string hash
var md = new KJUR.crypto.MessageDigest({ alg: "sha256" });
var hex = md.digestString("aaa");
// sha256("aaa") => 9834876dcfb05cb167a5c24953eba58c4ac89b1adf57f28f2f9d09af107ee8f0

// Incremental
var md2 = new KJUR.crypto.MessageDigest({ alg: "sha384" });
md2.updateString("hel");
md2.updateString("lo");
var hex2 = md2.digest();
```

Supported `alg` values: `sha1`, `sha224`, `sha256`, `sha384`, `sha512`, `md5`, `ripemd160`.

---

## Key generation

### RSA

```javascript
var kp = KEYUTIL.generateKeypair("RSA", 2048);
// kp.prvKeyObj  — private RSAKey object
// kp.pubKeyObj  — public RSAKey object

var privPem = KEYUTIL.getPEM(kp.prvKeyObj, "PKCS8PRV");
var pubPem  = KEYUTIL.getPEM(kp.pubKeyObj, "PKCS8PUB");
```

Supported RSA sizes: 1024, 2048, 3072, 4096, 8192. **Use 2048 minimum** for new projects.

### EC (ECC)

```javascript
var kp = KEYUTIL.generateKeypair("EC", "secp384r1");
// kp.prvKeyObj.prvKeyHex  — private scalar hex
// kp.prvKeyObj.curveName   — "secp384r1"
// kp.pubKeyObj.pubKeyHex   — uncompressed public point (04...)
// kp.pubKeyObj.curveName
```

Common curves:

| Name | Alias |
|------|-------|
| `secp256r1` | NIST P-256, prime256v1 |
| `secp384r1` | NIST P-384, **ECC384** |
| `secp521r1` | NIST P-521 |

---

## Load keys from PEM

```javascript
// Auto-detects PKCS#1, PKCS#8, encrypted PKCS#8, X.509 certificate
var key = KEYUTIL.getKey(pemString);
var keyEnc = KEYUTIL.getKey(pemString, "passphrase"); // encrypted PEM

// key.isPrivate / key.isPublic on RSAKey and EC key objects
```

---

## RSA signatures

```javascript
var sigAlg = "SHA256withRSA"; // also SHA384withRSA, SHA512withRSA

// Sign
var sig = new KJUR.crypto.Signature({ alg: sigAlg });
sig.init(privateKeyObj);
sig.updateString(message);
var sigHex = sig.sign();

// Verify
var sig2 = new KJUR.crypto.Signature({ alg: sigAlg });
sig2.init(publicKeyObj);
sig2.updateString(message);
var ok = sig2.verify(sigHex);
```

Alternative (legacy, still works):

```javascript
var rsa = new RSAKey();
rsa.readPrivateKeyFromPEMString(pemPrivate);
var hSig = rsa.sign("message", "sha256");

var pub = KEYUTIL.getKey(pemOrCert);
var ok = pub.verify("message", hSig);
```

---

## ECDSA signatures

```javascript
var curve = "secp384r1";
var sigAlg = "SHA384withECDSA"; // match hash strength to curve

// Option A — hex keys (from generateKeyPairHex)
var sig = new KJUR.crypto.Signature({ alg: sigAlg });
sig.init({ d: privHex, curve: curve });
sig.updateString(message);
var sigHex = sig.sign();

var sigV = new KJUR.crypto.Signature({ alg: sigAlg });
sigV.init({ xy: pubHex, curve: curve });
sigV.updateString(message);
var ok = sigV.verify(sigHex);

// Option B — KEYUTIL key objects
var sigB = new KJUR.crypto.Signature({ alg: sigAlg });
sigB.init(kp.prvKeyObj);
sigB.updateString(message);
var sigHexB = sigB.sign();
```

Signature output is **DER-encoded hex** (starts with `30`).

---

## RSA encrypt / decrypt

**Important:** jsrsasign 11.0+ removed RSA PKCS#1 v1.5 encryption due to the [Marvin attack](https://github.com/kjur/jsrsasign/security/advisories/GHSA-rh63-9qcf-83gf). Prefer **digital signatures** for integrity/auth. For bulk data, use AES + sign the AES key.

If your bundled version still supports it:

```javascript
var encHex = KJUR.crypto.Cipher.encrypt(plainText, publicKeyObj, "RSA");
var decStr = KJUR.crypto.Cipher.decrypt(cipherHex, privateKeyObj, "RSA");
```

RSA is for **small** payloads only (roughly key-size minus padding overhead).

---

## Random bytes

```javascript
var hex16 = KJUR.crypto.Util.getRandomHexOfNbytes(16); // 32 hex chars = 16 bytes
```

In CEngine2d, always mix additional entropy before key generation (see `CryptoManager.seedFromEnvironment`).

---

## Signature algorithms summary

| Algorithm string | Key type |
|------------------|----------|
| `SHA256withRSA` | RSA |
| `SHA384withRSA` | RSA |
| `SHA512withRSA` | RSA |
| `SHA256withECDSA` | EC |
| `SHA384withECDSA` | EC |
| `SHA512withECDSA` | EC |

---

## Typical workflows

### A — Generate and save keys

```
generateKeypair → getPEM → store locally (encrypt private PEM with user password)
```

### B — Sign save data / config

```
canonical JSON string → SHA256/384 → sign with private key → attach sigHex
```

### C — Verify server payload

```
load server public PEM → verify signature over exact byte string server signed
```

### D — Never do this

```
RSA-encrypt entire save file   ❌  (too slow, size limit, deprecated encrypt API)
SHA256(password) alone on server ❌  (use salt + iterations)
Send password with every API call ❌  (use key-based signatures after login)
```

---

## Bundled interactive samples

Open in a browser (for learning, not CEngine2d):

- `jsrsasign/sample/sample-rsasign.html` — RSA sign/verify
- `jsrsasign/sample/sample-ecdsa.html` — EC keygen, sign, verify

---

## See also

- [03-architecture.md](./03-architecture.md) — wrap these APIs behind `CryptoManager`
- [05-algorithms-and-security.md](./05-algorithms-and-security.md) — algorithm selection and library EOL
