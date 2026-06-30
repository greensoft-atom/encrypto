# 05 — Algorithms, Performance & Security

---

## Algorithm recommendations

### User identity (client-generated keys)

| Choice | Value | Rationale |
|--------|-------|-----------|
| Curve | **secp384r1** (P-384) | ~192-bit security; smaller keys/signatures than RSA-7680 |
| Signature | **SHA384withECDSA** | Matches curve strength |
| Hash for canonical strings | SHA-256 or SHA-384 | Either is fine if consistent |

### Server signing (config, asset manifests)

| Choice | Value | Rationale |
|--------|-------|-----------|
| RSA | **2048-bit** minimum | Wide tooling support, embed public PEM in client |
| Signature | **SHA256withRSA** | Standard, fast verify on client |

### Password storage (server)

| Do | Don't |
|----|-------|
| Random salt per user | Store plain password |
| 10,000+ iterations of hash/KDF | Store `SHA256(password)` |
| Upgrade path to PBKDF2/bcrypt/scrypt | Same salt for all users |

Client sends `passwordHash = sha256(username + "|" + password)` in register payload — server re-hashes with salt for storage. This is a **transport obfuscation**, not server storage format.

---

## Security equivalence (approximate)

| Algorithm | Comparable security |
|-----------|---------------------|
| RSA-2048 | ~112 bits |
| EC P-256 | ~128 bits |
| **EC P-384** | **~192 bits** |
| RSA-7680 | ~192 bits |

ECC384 gives high security with compact keys — good for mobile apps.

---

## Performance (pure JavaScript, relative)

Fast → slow:

```text
SHA-256          ████ Very fast
RSA verify       ███  Fast
ECDSA verify     ██   Medium
ECDSA sign       ██   Medium
RSA sign         █    Slow
RSA keygen 2048  █    Slow (run off main thread / at registration only)
EC keygen P-384  ██   Medium
```

For occasional auth and config verification, performance is usually fine. Avoid RSA sign/encrypt on every frame.

---

## jsrsasign library status

From the bundled [README](../README.md):

- **End of support: June 3, 2026** — npm packages deprecated.
- **CVE fixes** — stay on maintained fork or pinned version; review [security advisories](https://github.com/kjur/jsrsasign/security).
- **11.0.0+** — RSA PKCS#1 v1.5 **encryption/decryption removed** (Marvin attack). **Signatures still supported.**

For a long-lived Android app:

1. Pin the exact `jsrsasign-all-min.js` version you ship.
2. Hide it behind `CryptoManager` so you can swap libraries later.
3. Monitor for fork/community patches after EOL.

---

## Random number generation

SpiderMonkey in CEngine2d 1.5 may lack `crypto.getRandomValues`. jsrsasign uses its internal PRNG (`KJUR.crypto.Util.getRandomHexOfNbytes`).

**Before key generation:**

```javascript
CryptoManager.seedFromEnvironment(serverNonceHex);
// Mixes entropy into jsrsasign's rng_seed_int pool via rng.js.
// Call before the FIRST random/keygen operation in a session.
// Optionally: CryptoManager.addTouchEntropy(x, y) from input events
// Ideally: mix bytes from Android native secure random via JNI bridge
```

**Limitation:** jsrsasign's RNG (`rng.js`) initializes internal state on first use. Seeding is most effective when done at app startup before any key generation. Re-seeding after heavy random use has limited effect (see `rng.js` TODO comment in the library).

---

## RSA encryption limitations

| Issue | Detail |
|-------|--------|
| Size limit | ~245 bytes for RSA-2048 PKCS#1 v1.5 |
| Speed | Much slower than AES |
| Deprecation | Encrypt API removed in jsrsasign 11+ |
| Design | Use AES for data, signatures for authenticity |

---

## Signature pitfalls

### 1. Canonical strings

Always sign a deterministic string, not raw JSON:

```javascript
// Good
"register|alice|hash|04pub|175000|nonce"

// Bad — key order may differ
JSON.stringify({ username: "alice", ... })
```

### 2. Encoding

Sign UTF-8 strings consistently. jsrsasign `updateString` uses JavaScript string semantics — avoid mixing hex and string APIs on the same message without documentation.

### 3. ECDSA malleability

Use library verify — do not hand-roll ECDSA parsing.

### 4. Replay attacks

Include `timestamp` and single-use `serverNonce` / `challenge` in signed payloads. Server rejects stale or reused values.

---

## Key hygiene

- Private keys: encrypt at rest with user-derived key; never sync to cloud unencrypted.
- Public keys: fingerprint with SHA-384 for `metadata.json`.
- Debug logs: print first 16 hex chars only.
- Certificate pinning: embed server public PEM or SPKI hash in client for config updates.

---

## Compliance checklist before release

- [ ] `CryptoManager.initialize()` called at startup
- [ ] RNG seeded before any `generateECC` / `generateRSA`
- [ ] No jsrsasign imports outside `src/crypto/`
- [ ] Passwords never logged or sent post-login
- [ ] Signatures verified on server for all privileged actions
- [ ] Timestamp + nonce replay protection on server
- [ ] Pinned jsrsasign version documented in release notes

---

## Further reading

- [01-getting-started.md](./01-getting-started.md)
- [03-architecture.md](./03-architecture.md)
- [04-auth-flows.md](./04-auth-flows.md)
- Official wiki: https://github.com/kjur/jsrsasign/wiki
