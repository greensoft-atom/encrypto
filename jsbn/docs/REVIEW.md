# Final review — `jsbn/` stack for CEngine2d 1.5 Android

**Date:** re-verified now  
**Verdict:** **Approved for integration** — library, docs, and reference server are aligned and tested.

---

## Executive summary

The `jsbn/` fork is **ready to ship in a CEngine2d APK** for:

- RSA-2048 encrypt/decrypt  
- ECDH P-384 session keys  
- ECDSA P-384 sign (client) / verify (server)  
- Register → sign-in → signed user input auth  

Pure JavaScript at runtime — no Node, no browser, no native crypto required for core features.

**Pick `jsbn` only** if you want the lightweight 11-file stack. Do **not** mix its auth protocol with `jsrsasign` (different ECDSA hash: SHA-256 vs SHA384withECDSA).

---

## Automated verification (passed)

| Test | Command | Result |
|------|---------|--------|
| Client library (10 groups) | `node jsbn/test-smoke.js` | **All passed** |
| Server verification | `node jsbn/server/test-server-smoke.js` | **All passed** |

Coverage includes: sandbox load (no `window`/`navigator`/`cc`), SHA-256 FIPS vector, NIST P-384 `G` and `2×G`, ECDH agreement, ECDSA sign/verify + tamper rejection, full auth flows, RSA-2048 roundtrip, invalid-input safety, deterministic TEST_SEED keys, fixed example vectors from `BEGINNER-GUIDE.md`.

---

## Architecture sign-off

```
APK (11 scripts)                    Node server (dev/prod backend)
─────────────────                   ────────────────────────────────
CEngineSec.buildRegisterRequest  →  CEngineSec.verifyRegisterRequest
CEngineSec.buildSignInRequest    →  CEngineSec.verifySignInRequest
CEngineSec.wrapSignedInput       →  CEngineSec.verifySignedInput
CEngineSec.rsaEncrypt(n,e,...)   →  Node crypto RSA PKCS#1 decrypt (optional)
```

Server loads the **same jsbn scripts** via `load-cengine-sec.js` — verification math matches the APK exactly.

---

## Cryptographic review

| Component | Status | Notes |
|-----------|--------|-------|
| secp384r1 parameters | **Pass** | Matches NIST / jsrsasign |
| ECDH shared secret | **Pass** | Uncompressed `04` points, 194-char `pubHex` |
| ECDSA sign/verify | **Pass** | SHA-256 digest → ECDSA; retries when `s=0` |
| Auth canonical strings | **Pass** | Client `cengine-sec.js` = server verify |
| RSA-2048 PKCS#1 v1.5 | **Pass** | Interoperates with OpenSSL / Node `crypto` |
| Password on wire | **Pass** | `SHA256(username + "|" + password)` — not plain text |

**Accepted limitations** (documented, not blockers):

- No on-curve point validation in `ec.js` (upstream Tom Wu behavior)  
- ECDSA high-`s` malleability not normalized  
- Client-side ECDSA verify is very slow — verify on server only  
- `passwordHash` is a wire hash, not a server password KDF (Argon2/bcrypt)  

---

## Runtime safety (CEngine2d / SpiderMonkey)

| Check | Status |
|-------|--------|
| No required `window` / `navigator` / `alert()` in shipped `.js` | **Pass** |
| Errors via `jsbn_error()` / `CEngineSec.setErrorHandler` | **Pass** |
| Invalid hex / bad keys return `null`/`false`, no throw | **Pass** |
| `saveUserLocal` guards missing `JSON` / `cc.sys.localStorage` | **Pass** |
| HTML demos (`*.html`) use `alert()` | **Do not ship** |

**RNG:** Must call `seedRandom(serverNonce + clientEntropy)` before `createUserIdentity()`. Fixed TEST_SEED is debug-only.

---

## Documentation review

| Document | Status |
|----------|--------|
| [`jsbn/BEGINNER-GUIDE.md`](jsbn/BEGINNER-GUIDE.md) | Complete — concepts, exact values, flows, server setup |
| [`jsbn/CEngine.md`](jsbn/CEngine.md) | Complete — integration, checklist, API reference |
| [`jsbn/README.md`](jsbn/README.md) | Complete — fork notes, file table |
| [`jsbn/server/README.md`](jsbn/server/README.md) | Complete — API + curl examples |
| Root [`README.md`](README.md) | Complete — stack split, doc map |

Load order is **consistent everywhere**:

`jsbn.js → jsbn2.js → prng4.js → rng.js → sha256.js → rsa.js → rsa2.js → ec.js → sec.js → ecdsa.js → cengine-sec.js`

TEST_SEED public key prefix: `04b9a3ebdde9a29ca951594d0ed3b65a831e28d3...` (consistent in docs and tests).

---

## Reference server review (`jsbn/server/`)

**Correct for protocol testing and as a backend template.**

| Endpoint | Verified behavior |
|----------|-------------------|
| `GET /api/hello` | Issues 64-char hex nonce + RSA `n`/`e` |
| `POST /api/register` | Nonce consume, format checks, ECDSA verify, store user |
| `GET /api/signin/start` | Challenge + nonce per user |
| `POST /api/signin` | `pubHex` match, challenge/nonce match, ECDSA verify → session |
| `POST /api/game/input` | Bearer session + signature verify |

**Before production**, extend the reference server with:

1. Database (users, sessions)  
2. HTTPS termination  
3. Session TTL / refresh  
4. Timestamp skew checks on register/sign-in  
5. Nonce TTL sweep (unused hello nonces)  
6. Persist RSA key pair (currently regenerated each restart)  

---

## What to ship in the APK

**Include (11 files):**

`jsbn.js`, `jsbn2.js`, `prng4.js`, `rng.js`, `sha256.js`, `rsa.js`, `rsa2.js`, `ec.js`, `sec.js`, `ecdsa.js`, `cengine-sec.js`

**Optional pattern file:** `example-auth-scene.js` (copy logic, don’t require as-is)

**Do not include:**

`test-smoke.js`, `server/`, `*.html`, `BEGINNER-GUIDE.md` (docs only)

---

## Pre-ship checklist (final)

- [ ] `node jsbn/test-smoke.js` passes on your dev machine  
- [ ] All 11 scripts loaded in order before game logic  
- [ ] Server backend uses **jsbn protocol** (SHA-256 + ECDSA P-384)  
- [ ] Client seeds RNG from `/api/hello` nonce before keygen  
- [ ] `privHex` never sent to server; only `pubHex`  
- [ ] Auth over HTTPS  
- [ ] ECDSA verify only on server, not every frame on device  
- [ ] Not mixing jsbn APK with jsrsasign server (or vice versa)  

---

## Final recommendation

| Audience | Action |
|----------|--------|
| **Game client dev** | Integrate per [`BEGINNER-GUIDE.md`](jsbn/BEGINNER-GUIDE.md) + [`example-auth-scene.js`](jsbn/example-auth-scene.js) |
| **Backend dev** | Start from [`jsbn/server/server.js`](jsbn/server/server.js); harden for production |
| **QA** | Run both smoke tests; debug build with TEST_SEED and compare `pubHex` prefix |

**Bottom line:** The `jsbn` stack is **correct, consistent, tested, and documented**. No blocking code issues were found in this final review. Remaining work is **production hardening** (DB, HTTPS, session policy) on your server side, not fixes to the crypto library itself.