I think **jsrsasign** is the best choice for your project. It was designed before WebCrypto and Node.js became common, so it still supports the kind of JavaScript environment that Cocos2d-JS 1.5 uses.

Since you're building a long-lived Android game, I'd treat this as an architecture decision rather than just "adding a library."

---

# 1. Your Environment

From what you've described previously, your runtime looks something like this:

```
Android APK
    │
    ▼
Cocos2d 1.5
    │
    ▼
SpiderMonkey JavaScript Engine
    │
    ▼
Your Game Scripts
```

Notice what's **missing**:

❌ Node.js

❌ npm

❌ CommonJS

❌ ES Modules

❌ Browser DOM

❌ window.crypto

❌ WebCrypto

❌ fetch()

❌ require()

Therefore everything must be:

```
Pure JavaScript
```

loaded simply as

```javascript
js.include("crypto/jsrsasign-all-min.js");
```

or whatever loading mechanism Cocos2d 1.5 provides.

---

# 2. What is jsrsasign?

Think of it as a complete cryptography toolkit.

Instead of providing only RSA, it provides nearly everything needed for public-key cryptography.

```
jsrsasign
│
├── BigInteger
├── ASN.1
├── PEM
├── DER
├── PKCS#1
├── PKCS#5
├── PKCS#8
├── RSA
├── ECDSA
├── DSA
├── SHA
├── HMAC
├── X509
├── CSR
├── Certificate parser
└── Utilities
```

You don't have to use all of it.

---

# 3. Supported Algorithms

## RSA

Supported key sizes

```
1024
2048
3072
4096
8192
```

Operations

```
Encrypt

Decrypt

Sign

Verify

Generate Keys

Import PEM

Export PEM
```

---

## ECC

Supported curves include:

```
secp192r1

secp224r1

secp256r1

secp384r1

secp521r1
```

The one you asked about:

```
ECC384

=

secp384r1

=

NIST P-384
```

is fully supported.

---

## Hashes

```
SHA1

SHA224

SHA256

SHA384

SHA512
```

---

## Signature Algorithms

```
SHA256withRSA

SHA384withRSA

SHA512withRSA

SHA256withECDSA

SHA384withECDSA

SHA512withECDSA
```

---

# 4. Internal Architecture

Internally it looks roughly like this:

```
Your Game
      │
      ▼
KJUR.crypto.Signature
      │
      ▼
RSA or ECDSA
      │
      ▼
BigInteger Math
      │
      ▼
JavaScript Numbers + Arrays
```

There is **no native code**.

Everything is pure JavaScript.

---

# 5. Main Objects

You'll mostly use only a few APIs.

## KEYUTIL

Responsible for keys.

```
Load PEM

Generate Keys

Export Keys

Read PKCS8

Read PKCS1
```

Example:

```javascript
var kp = KEYUTIL.generateKeypair(
    "RSA",
    2048
);
```

---

## Signature

Signing and verifying.

```javascript
var sig =
new KJUR.crypto.Signature({
    alg:"SHA256withRSA"
});
```

---

## MessageDigest

Hashing.

```javascript
var md =
new KJUR.crypto.MessageDigest({
    alg:"sha256"
});
```

---

## Cipher

RSA encryption.

```
RSAEncrypt

RSADecrypt
```

---

# 6. Typical Workflows

There are only a few common workflows.

---

## Workflow A

Generate Key

```
Generate RSA2048

↓

Save PEM

↓

Use later
```

---

## Workflow B

Sign

```
Private Key

↓

SHA256

↓

RSA

↓

Signature
```

---

## Workflow C

Verify

```
Message

↓

SHA256

↓

RSA Verify

↓

true / false
```

---

## Workflow D

Encrypt

```
Plaintext

↓

Public Key

↓

RSA

↓

Ciphertext
```

---

## Workflow E

Decrypt

```
Ciphertext

↓

Private Key

↓

RSA

↓

Plaintext
```

---

# 7. RSA Encryption

Suppose you have

```
Server Public Key
```

stored in

```
public.pem
```

Load it.

```
↓

Encrypt

↓

Send to Server
```

Only the server can decrypt.

---

# 8. RSA Signatures

```
Game

↓

Private Key

↓

Sign Save Data

↓

Server

↓

Verify
```

or

```
Server

↓

Private Key

↓

Sign Configuration

↓

Game

↓

Verify
```

Very common.

---

# 9. ECC Signatures

Exactly the same idea.

```
Private Key

↓

ECDSA

↓

Signature
```

Verification

```
Public Key

↓

ECDSA Verify
```

---

# 10. Why ECC384?

RSA2048 security roughly equals ECC P-224 to P-256, while P-384 provides a higher security margin.

Approximate comparison:

| Algorithm | Comparable Security |
| --------- | ------------------- |
| RSA2048   | ~112 bits           |
| ECC256    | ~128 bits           |
| ECC384    | ~192 bits           |
| RSA7680   | ~192 bits           |

ECC384 offers much smaller keys and signatures than an RSA key with a similar security level.

---

# 11. Performance

Typical relative costs in pure JavaScript are:

```
SHA256

Very Fast
```

↓

```
RSA Verify

Fast
```

↓

```
ECDSA Verify

Medium
```

↓

```
ECDSA Sign

Medium
```

↓

```
RSA Sign

Slow
```

For a game, occasional signing or verification (such as validating save files or server responses) is usually not a performance issue.

---

# 12. Recommended Project Structure

Instead of scattering cryptographic calls throughout your game code, encapsulate them behind a single module:

```
src/

    crypto/

        jsrsasign-all-min.js

        CryptoManager.js

        RSA.js

        ECC.js

        Hash.js

        PemLoader.js

        Random.js
```

Your game code should interact only with `CryptoManager`, keeping the underlying library isolated. If you ever need to replace or upgrade the cryptography implementation, the rest of your game remains unchanged.

---

# 13. Practical Use Cases for a Cocos2d-JS Game

A sensible division of responsibility would be:

| Purpose                    | Algorithm                   |
| -------------------------- | --------------------------- |
| Verify server messages     | RSA-2048 or ECDSA P-384     |
| Sign server updates        | RSA-2048 or ECDSA P-384     |
| Verify downloadable assets | RSA-2048 or ECDSA P-384     |
| Verify configuration files | RSA-2048 or ECDSA P-384     |
| Hash save files            | SHA-256                     |
| Verify replay integrity    | SHA-256 + digital signature |

One important note: **avoid using RSA to encrypt large amounts of game data.** RSA is intended for encrypting small pieces of data (such as symmetric keys) or creating digital signatures. If your goal is to protect save files or downloaded assets, the usual design is:

* Use **AES** to encrypt the actual data.
* Use **RSA** or **ECDSA** to authenticate the AES key or to digitally sign the data.
* Use **SHA-256** or **SHA-384** for integrity checking.

---

## What I'd suggest next

Since you're building a production Android game with a legacy Cocos2d-JS runtime, I recommend designing a complete cryptography subsystem rather than calling `jsrsasign` APIs directly throughout the project.

A good next step would be to build a reusable `CryptoManager` that wraps `jsrsasign` and exposes a clean API such as:

* `CryptoManager.hash()`
* `CryptoManager.sign()`
* `CryptoManager.verify()`
* `CryptoManager.encryptRSA()`
* `CryptoManager.decryptRSA()`
* `CryptoManager.loadKey()`

This keeps your game code independent of the library and makes future maintenance much easier.
