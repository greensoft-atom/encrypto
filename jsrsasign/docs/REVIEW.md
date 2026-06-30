# Code & Documentation Review Notes

Review performed against jsrsasign APIs, smoke tests, and consistency with [discussion_01.md](./discussion_01.md) / [discussion_02.md](./discussion_02.md).

---

## Issues found and fixed

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | **High** | `seedFromEnvironment()` gathered bytes but never fed jsrsasign's PRNG — `_lastSeedHex` was stored but `rng_seed_int` was never called | Now mixes entropy via global `rng_seed_int` + `rng_seed_time` |
| 2 | **High** | `identityToRecord()` stored plaintext `privHex` alongside `privEnc` when password was given | Production path stores `privEnc` only; plaintext `privHex` only when no password (dev/test) |
| 3 | **High** | `signUserInput()` read private key from disk without password after encrypted storage | Requires unlocked session (`signIn` / `unlockSession`); added `_sessionIdentity` + `clearSession()` |
| 4 | **Medium** | `verifyRSA()` used `handle._prv` as fallback — could verify with wrong key material | Public-only path: `_pub` or `_prv.isPublic` only |
| 5 | **Medium** | `verifyPassword()` iteration count not preserved in first version | Format now `salt:iterations:hash`; verify parses iterations |
| 6 | **Low** | Signed input packet missing `curve` field | Added `curve` to `signUserInput` payload |
| 7 | **Low** | Docs said `register()` returns `record` directly | Corrected to `{ record, request }` |
| 8 | **Low** | Architecture doc listed `encryptRSA`/`decryptRSA` from discussion but not implemented | Documented as intentionally omitted (jsrsasign 11+ Marvin advisory) |
| 9 | **Medium** | `base64Decode()` called nonexistent `hex2utf8` | Switched to jsrsasign's `utf8tob64` / `b64toutf8` |

---

## Verified correct

- SHA-256 known vector `sha256("aaa")` matches jsrsasign test suite
- SHA-256 `sha256("hello world")` in getting-started doc is correct
- EC P-384 keygen, sign (`SHA384withECDSA`), verify roundtrip
- RSA-2048 sign/verify roundtrip
- PEM export/import for EC public keys
- Register / sign-in / signed-input auth flows (server-side verify helpers)
- `KJUR.crypto.Mac` HmacSHA256 API usage
- `hextob64` / `utf8tohex` / `b64tohex` / `hextoutf8` globals from jsrsasign bundle
- Preferred helpers: `utf8tob64` / `b64toutf8` (used by CryptoManager)
- ES5 syntax throughout (Cocos2d 1.5 compatible)

---

## Known limitations (documented, not bugs)

1. **`privEnc` obfuscation is a stub** — XOR nibble scheme is not production-grade. Upgrade to AES-256 + PBKDF2/scrypt before release.

2. **jsrsasign RNG re-seeding** — After first `getRandomHexOfNbytes`, internal Arcfour state is fixed (`rng.js` TODO). Seed at app startup before any keygen.

3. **No RSA encrypt/decrypt in CryptoManager** — Library deprecated PKCS#1 v1.5 encryption. Use signatures + AES for bulk data.

4. **Password transport hash** — Client sends `sha256(username|password)` for registration; server must apply proper salted KDF for storage.

5. **Node smoke test shims** — Requires `navigator.appName = "Netscape"` and mock `cc.sys.localStorage`; not needed on device.

6. **jsrsasign EOL** — End of support June 2026; pin version and keep facade for future library swap.

---

## Smoke test coverage (10 tests)

Run: `node jsrsasign/docs/examples/test-smoke.js`

1. Initialize  
2. SHA-256 vector  
3. EC P-384 sign/verify  
4. RSA-2048 sign/verify  
5. PEM export/import  
6. Password hash/verify  
7. Register (no plaintext privHex)  
8. Sign-in (session unlock)  
9. Signed user input (session required)  
10. RNG seed + base64 roundtrip  

---

## Files reviewed

```
docs/README.md
docs/01-getting-started.md
docs/02-jsrsasign-core-api.md
docs/03-architecture.md
docs/04-auth-flows.md
docs/05-algorithms-and-security.md
docs/examples/CryptoManager.js
docs/examples/IdentityManager.js
docs/examples/IdentityManager.js
docs/examples/example-auth-scene.js
docs/examples/COCOS2D.md
docs/examples/test-smoke.js
```
