# jsbn — RSA and ECC in JavaScript

The **jsbn** library is a fast, portable implementation of large-number math in pure JavaScript, enabling public-key cryptography and other applications on desktop and mobile browsers.

## CEngine 1.5 Android (this fork)

This fork is adapted for **embedded JavaScript runtimes** (CEngine-x, SpiderMonkey, JavaScriptCore) with **no Node.js and no browser**:

- Removed hard dependencies on `navigator`, `window`, and `alert()`
- Added **secp384r1** (NIST P-384) curve parameters
- Added **`cengine-sec.js`** — high-level API for RSA-2048 and ECDH P-384
- Added **`CEngine.md`** — full integration guide for CEngine 1.5 Android

**Start here:** [CEngine.md](CEngine.md)

## Demos

- **RSA Encryption Demo** — simple RSA encryption of a string with a public key
- **RSA Cryptography Demo** — more complete demo of RSA encryption, decryption, and key generation
- **ECDH Key Agreement Demo** — Diffie-Hellman key agreement using elliptic curves

## Source Code

The API for the jsbn library closely resembles that of the `java.math.BigInteger` class in Java. For example:

```javascript
x = new BigInteger("abcd1234", 16);
y = new BigInteger("beef", 16);
z = x.mod(y);
alert(z.toString(16));
```

This will print `b60c`.

### Core Library

| File | Description |
|------|-------------|
| `jsbn.js` | Basic `BigInteger` implementation — just enough for RSA encryption and not much more. |
| `jsbn2.js` | The rest of the library, including most public `BigInteger` methods. |

### RSA

| File | Description |
|------|-------------|
| `rsa.js` | Implementation of RSA encryption; does **not** require `jsbn2.js`. |
| `rsa2.js` | Rest of the RSA algorithm, including decryption and key generation. |

### ECC

| File | Description |
|------|-------------|
| `ec.js` | Elliptic curve math; depends on both `jsbn.js` and `jsbn2.js`. |
| `sec.js` | Standard elliptic curve parameters (includes **secp384r1**). |
| `sha256.js` | SHA-256 hash (`hex_sha256`). |
| `ecdsa.js` | ECDSA sign/verify for secp384r1. |
| `cengine-sec.js` | High-level API: RSA-2048, ECDH, ECDSA, register/sign-in helpers. |

### Utilities

| File | Description |
|------|-------------|
| `rng.js` | Entropy collector and RNG interface; optional `window.crypto` when present; `rng_seed_bytes()` for native seeding. |
| `prng4.js` | ARC4-based PRNG backend for `rng.js`; very small. |
| `base64.js` | Base64 encoding and decoding routines. |
| `sha1.js` | SHA-1 hash function; only needed for the IBE demo. |

## Interoperability

The demo encrypts strings directly using PKCS#1 encryption-style padding (type 2), which is currently the only supported format. To show interoperability with a potential OpenSSL-based backend that decrypts strings, try the following on any system with the OpenSSL command line tool installed.

### 1. Generate a new public/private keypair

```bash
$ openssl genrsa -out key.pem
Generating RSA private key, 512 bit long modulus
..++++++++++++
..............++++++++++++
e is 65537 (0x10001)
$
```

### 2. Extract the modulus from your key

```bash
$ openssl rsa -in key.pem -noout -modulus
Modulus=DA3BB4C40E3C7E76F7DBDD8BF3DF0714CA39D3A0F7F9D7C2E4FEDF8C7B28C2875F7EB98950B22AE82D539C1ABC1AB550BA0B2D52E3EF7BDFB78A5E817D74BBDB
$
```

### 3. Encrypt in the RSA Encryption demo

1. Go to the **RSA Encryption** demo and paste the modulus value into the **Modulus (hex)** field at the bottom.
2. Make sure the value in the **Public exponent** field is `10001`, or whatever value your public key uses.
3. Type a short string (e.g. `testing`) into the **Plaintext (string)** field and click **encrypt**. The result should appear in the **Ciphertext** fields.

### 4. Decrypt with OpenSSL

Copy the base64 version of the ciphertext and paste it as the input of the following command:

```bash
$ openssl base64 -d | openssl rsautl -inkey key.pem -decrypt
1JW24UMKntVhmmDilAYC1AjLxgiWHBzTzZsCVAejLjVri92abLHkSyLisVyAdYVr
fiS7FchtI9vupe9JF/m3Kg==
```

Hit Ctrl-D (or whatever your OS uses for end-of-file). Your original plaintext should appear:

```bash
testing$
```

## Performance

The speed tables contain detailed timing information for jsbn performing public-key operations such as RSA, ECC, and IBE.

## Projects That Use jsbn

- **[Forge](https://github.com/digitalbazaar/forge)** — a pure JavaScript implementation of SSL/TLS; includes a discussion of their choice of BigInteger library
- **[Dojo Toolkit](https://dojotoolkit.org/)** — uses jsbn in their `dojox.math.BigInteger` class
- **No More Cleartext Passwords** — this project switched from another JavaScript BigInteger library for performance reasons
- **Google's V8 benchmark suite**, version 6
- **JavaScript Cryptography Toolkit**
- **RSA-Sign JavaScript library**
- **JavaScript RSA**

## History

### Fork (cengine-sec)

- Runtime-safe: no required browser globals; `jsbn_error()` hook instead of `alert()`
- Added `secp384r1` curve and `CocosSec` API
- Deterministic `seedRandom(bytes)` for testing; `seedFromEnvironment()` for production
- Verified with `test-smoke.js` (sandbox, no browser globals)
- See [CEngine.md](CEngine.md) for usage

### Version 1.4 (7/1/2013)

- Fixed variable name collision between `sha1.js` and `base64.js`.
- Obtain entropy from `window.crypto.getRandomValues` where available.
- Added `ECCurveFp.encodePointHex`.
- Fixed inconsistent use of `DV` in `jsbn.js`.

### Version 1.3 (7/3/2012)

- Fixed bug when comparing negative integers of different word lengths.

### Version 1.2 (3/29/2011)

- Added `square` method to improve ECC performance.
- Use randomized bases in `isProbablePrime`.

### Version 1.1 (9/15/2009)

- Added support for UTF-8 encoding of non-ASCII characters when PKCS#1 encoding and decoding JavaScript strings.
- Fixed bug when creating a new `BigInteger("0")` in a non power-of-2 radix.

## Licensing

jsbn is released under a BSD license. See `LICENSE` for details.

---

**Tom Wu**  
Last modified: Tue Sep 15 23:30:00 PST 2009
