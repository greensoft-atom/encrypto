# jsrsasign Stack — Deep Correctness Audit

Audit date: 2026-07-01  
Target: **CEngine2d 1.5 / SpiderMonkey / Android APK**  
Bundle: **jsrsasign 11.1.3** (`jsrsasign-all-min.js`)  
Scope: CryptoManager, IdentityManager, NetworkManager, BizApiClient, examples, runtime compatibility

---

## Executive summary

| Area | Verdict |
|------|---------|
| Core crypto (hash, EC P-384, RSA, PEM) | **Correct** — verified by smoke tests |
| Auth flows (register / sign-in / signed input) | **Correct after fixes** — see §Issues fixed |
| CEngine2d runtime load | **Requires bootstrap** — `navigator` must exist before jsrsasign |
| HTTPS via XMLHttpRequest | **Architecturally correct** — TLS is engine-native, not JS |
| Production readiness | **Integration-ready** — device HTTPS proof + DB-backed server still required before live release |

**Bottom line:** The stack is suitable for integration and staged rollout. Before production: (1) load `cengine-bootstrap.js` first, (2) run `network-probe.js` on a real APK, (3) pin jsrsasign 11.1.3, (4) deploy Express/ServerAuth with real DB + Redis (not in-memory demo).

---

## Requirements checklist

| Requirement | Status | Notes |
|-------------|--------|-------|
| Pure JavaScript, no Node at runtime | ✅ | Node used only for smoke tests |
| No npm / ES modules / WebCrypto | ✅ | ES5 throughout |
| No user-written Android Java | ✅ | HTTPS via engine XHR |
| EC P-384 user keys | ✅ | Default `secp384r1` |
| SHA384withECDSA signatures | ✅ | Test 12 confirms default alg |
| Register / login / signed biz actions | ✅ | Canonical strings + verify helpers |
| Biz → IdentityManager → CryptoManager → jsrsasign | ✅ | Facade pattern enforced in docs |
| localStorage persistence | ⚠️ | Depends on `cc.sys.localStorage` on device |
| Secure private key at rest | ✅ | AES-256-CBC + PBKDF2 (`privEnc` v2 format) |

---

## Critical runtime issues (CEngine2d)

### 1. `navigator` required at jsrsasign load time — **BLOCKER without shim**

jsrsasign 11.1.3 accesses `navigator.appName` while the BigInteger module initializes:

```text
ReferenceError: navigator is not defined
```

Reproduced in Node without a `navigator` global. CEngine2d SpiderMonkey often has **no** `navigator`.

**Fix (required):** Load `cengine-bootstrap.js` **before** `jsrsasign-all-min.js`:

```javascript
require("src/crypto/cengine-bootstrap.js");
require("src/crypto/jsrsasign-all-min.js");
```

File: [`examples/cengine-bootstrap.js`](./examples/cengine-bootstrap.js)

### 2. `XMLHttpRequest` may be absent

`NetworkManager.isAvailable()` returns false if XHR is undefined. Some engine builds or simulators lack it.

**Action:** Run [`examples/network-probe.js`](./examples/network-probe.js) on a real APK before relying on HTTPS.

### 3. Globals required by CryptoManager

| Global | Source | Checked at init |
|--------|--------|-----------------|
| `KEYUTIL`, `KJUR` | jsrsasign bundle | ✅ |
| `utf8tob64`, `b64toutf8` | jsrsasign bundle | ✅ (added) |
| `rng_seed_int`, `rng_seed_time` | jsrsasign `rng.js` | ✅ (added) |
| `JSON` | ES5 runtime | Assumed present |
| `setTimeout` / `clearTimeout` | Engine | Used by NetworkManager fallback timeout |
| `cc`, `cc.sys.localStorage` | CEngine2d | Required for persistence |

### 4. SpiderMonkey / ES5 compatibility

Verified in source review:

- No `let`, `const`, arrow functions, classes, or template literals in facade code
- `>>>` operator used (ES3+) — supported by SpiderMonkey
- jsrsasign bundle uses `typeof globalThis` guard — safe when `globalThis` is undefined
- jsrsasign may use `Uint8Array` inside `rng.js` only when `window.crypto` exists — not on bare CEngine

---

## Issues found and fixed in this audit

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| A1 | **Critical** | jsrsasign crashes if `navigator` undefined | Added `cengine-bootstrap.js`; docs updated |
| A2 | **Critical** | Wrong password still unlocked session (`signIn` returned request, server rejected but client session was set) | `_verifyPrivMatchesPub()` after decrypt; wrong password → `null` |
| A3 | **High** | `register()` saved locally even when `saveLocal()` failed (silent data loss) | `register()` returns `null` if save fails |
| A4 | **Medium** | `example-auth-biz.js` posted register/sign-in to `/api/action` | Fixed endpoint paths per payload type |
| A5 | **Medium** | CryptoManager did not validate `utf8tob64` / `rng_seed_int` at init | Explicit checks with clear error messages |
| A6 | **Low** | Docs omitted mandatory bootstrap step | CENGINE.md + 01-getting-started updated |

---

## Previously fixed (REVIEW.md)

Entropy seeding, encrypted-only storage, session-gated signing, RSA verify public-only path, base64 helpers, password iteration format — all still valid. See [REVIEW.md](./REVIEW.md).

---

## Verified correct (runtime-tested)

```
node jsrsasign/docs/examples/test-smoke.js            # 14 tests
node jsrsasign/docs/examples/test-network-smoke.js    # 5 tests
node jsrsasign/docs/examples/test-server-smoke.js     # 6 tests
node jsrsasign/docs/examples/example-server-verify.js # 11-step walkthrough
```

| Test | What it proves |
|------|----------------|
| SHA-256("aaa") | Known vector matches jsrsasign |
| EC P-384 sign/verify | Keygen + tamper rejection |
| RSA-2048 sign/verify | Public-only verify path |
| PEM export/import | KEYUTIL roundtrip |
| Register flow | No plaintext `privHex` when password given |
| Sign-in + session | Session required for `signUserInput` |
| Wrong password | Returns null, no session (Test 11) |
| SHA384withECDSA default | pubHex-only verify (Test 12) |
| Bootstrap shim | jsrsasign loads without pre-set navigator (Test 13) |
| NetworkManager | GET/POST, auth header, error codes |

---

## Remaining risks (not fixed — by design or scope)

### Security / crypto

1. **`privEnc` format (v2)** — AES-256-CBC + PBKDF2-HMAC-SHA256 (10 000 iterations) with integrity tag. Legacy XOR v1 blobs still decrypt via `decryptPrivateHex`. Format: `v2|iter|salt|iv|ciphertext|tag`.

2. **Password transport hash** — Client sends `sha256(username|password)`. Server stores KDF-wrapped hash when `USE_PASSWORD_KDF` is true.

3. **jsrsasign PRNG re-seeding** — After first `getRandomHexOfNbytes`, internal pool is fixed (`rng.js` TODO). Call `seedFromEnvironment()` once at startup before any keygen; do not rely on re-seeding mid-session.

4. **No RSA PKCS#1 v1.5 encrypt** — jsrsasign 11+ removed it (Marvin CVE). Use signatures + AES for bulk confidentiality.

5. **jsrsasign EOL** — Support ends **June 2026**. Pin 11.1.3; keep CryptoManager facade for future library swap.

### Auth protocol edge cases

6. **Register without `onServerHello`** — ~~Empty `serverNonce` in canonical string~~ **Fixed:** `buildRegisterRequest` returns `null` if `SERVER_NONCE` empty (Test 14).

7. **Sign-in without challenge** — ~~Empty challenge allowed~~ **Fixed:** `buildSignInRequest` returns `null` without challenge/nonce; `BizApiClient.login` rejects missing challenge.

8. **Clock skew** — Timestamps validated server-side (`ServerAuth.TIMESTAMP_SKEW_MS` = 5 min).

9. **Replay** — Server tracks spent nonces/challenges in `ServerAuth` (in-memory demo — use Redis in production).

### Networking

10. **HTTPS not tested on real device** — Only mock XHR in Node. Certificate pinning, SNI, TLS version — all engine-dependent.

11. **NetworkManager double events** — `finished` flag prevents double callback; `onerror` + `readyState 4` with status 0 possible on some engines — handled.

12. **`BizApiClient.register` orphan local record on server failure** — Local identity saved before POST. Failure callback now includes `localRecord`; use `IdentityManager.clearLocal()` to rollback if needed.

### Client / storage (fixed or documented)

13. **Login sign-in POST failure left session unlocked** — **Fixed:** `clearSession()` on `LOGIN_SIGNIN_FAILED`.

14. **Actions without Bearer token on server** — **Fixed:** `ServerAuth.handleAction` requires token.

15. **Single identity per device** — `STORAGE_KEY = "identity_v1"` holds one user only.

16. **`example-auth-biz.js` missing NetworkManager.init** — **Fixed.**

17. **`hexDecode` odd-length hex** — Silently drops last nibble.

### Performance

18. **RSA-2048 keygen in pure JS** — Slow on mobile. Use EC P-384 (default).

19. **Bundle size ~350 KB** — Plan APK size accordingly.

---

## Recommended load order (device)

```javascript
require("src/crypto/cengine-bootstrap.js");   // 1 — mandatory
require("src/crypto/jsrsasign-all-min.js");     // 2
require("src/crypto/CryptoManager.js");         // 3
require("src/crypto/IdentityManager.js");       // 4
require("src/network/NetworkManager.js");       // 5
require("src/network/BizApiClient.js");         // 6
```

First scene bootstrap:

```javascript
IdentityManager.init();
CryptoManager.seedFromEnvironment(); // optional extra entropy before first keygen
BizApiClient.init({ baseUrl: "https://your-api.example.com" });
BizApiClient.probeHttps(function(r) { cc.log(r.ok ? "HTTPS OK" : r.error); });
```

---

## Version pin

| Component | Version | Location |
|-----------|---------|----------|
| jsrsasign | **11.1.3** | `jsrsasign/npm/package.json` |
| CryptoManager | 1.0.0 | `examples/CryptoManager.js` |
| NetworkManager | 1.0.0 | `examples/NetworkManager.js` |

Do not upgrade jsrsasign without re-running all smoke tests and checking [Marvin / API changelog](https://github.com/kjur/jsrsasign).

---

## Files changed in this audit

```
jsrsasign/docs/examples/cengine-bootstrap.js   (new)
jsrsasign/docs/examples/CryptoManager.js       (init checks)
jsrsasign/docs/examples/IdentityManager.js     (password verify, saveLocal)
jsrsasign/docs/examples/example-auth-biz.js    (endpoint paths)
jsrsasign/docs/examples/test-smoke.js          (tests 11–13)
jsrsasign/docs/examples/CENGINE.md             (bootstrap)
jsrsasign/docs/01-getting-started.md           (bootstrap)
jsrsasign/docs/REVIEW.md                       (cross-ref)
jsrsasign/docs/AUDIT.md                        (this file)
```

---

## Second pass audit (2026-07-01, full stack re-review)

Full re-read of all `docs/examples/*.js`, docs, jsrsasign 11.1.3 bundle compatibility, and end-to-end client+server flows.

### Component verdicts

| Component | Verdict | Notes |
|-----------|---------|-------|
| `jsrsasign-all-min.js` | ✅ Pin 11.1.3 | Needs `cengine-bootstrap.js`; uses `navigator`, optional `globalThis`/`Uint8Array` |
| `cengine-bootstrap.js` | ✅ Required | ES5 global assignment; works in Node vm + CEngine |
| `CryptoManager.js` | ✅ Correct | Hash/sign/verify/PEM/RNG; init guards present |
| `IdentityManager.js` | ✅ Correct | Auth flows, session, privEnc, password verify |
| `NetworkManager.js` | ✅ Correct | XHR, timeout, double-callback guard |
| `BizApiClient.js` | ✅ Correct after B-fixes | HTTPS orchestration |
| `ServerAuth.js` | ✅ Correct | Server verify + replay + session |
| Examples / docs | ✅ Aligned | Bootstrap in load order everywhere critical |

### Issues fixed in second pass (B-series)

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| B1 | **High** | Sign-in HTTP failure left unlocked session | `clearSession()` on `LOGIN_SIGNIN_FAILED` |
| B2 | **High** | Empty login challenge still signed | `buildSignInRequest` requires challenge + nonce; BizApiClient checks challenge |
| B3 | **Medium** | Register without hello still built request | `buildRegisterRequest` requires `SERVER_NONCE` (Test 14) |
| B4 | **Medium** | Server accepted actions without Bearer token | `handleAction` requires token |
| B5 | **Medium** | Register failure gave no local rollback hint | Callback includes `localRecord`; added `IdentityManager.clearLocal()` |
| B6 | **Low** | `example-auth-biz.js` never init NetworkManager | Added `NetworkManager.initialize` in `BizAuth.init` |
| B7 | **Low** | Architecture doc said `login()` | Corrected to `signIn()` |

### Intentionally not fixed (production follow-up)

| Item | Why |
|------|-----|
| `privEnc` XOR obfuscation | Documented; needs AES+KDF before release |
| Orphan local record on register fail | App must call `clearLocal()` or retry; auto-delete risky if server actually saved user |
| jsrsasign EOL June 2026 | Pin version; facade allows swap |
| HTTPS on real APK | Requires device test with `network-probe.js` |
| In-memory ServerAuth stores | Replace with DB + Redis for nonces |

### Test matrix (all passing)

| Suite | Tests | Status |
|-------|-------|--------|
| `test-smoke.js` | 14 | ✅ |
| `test-network-smoke.js` | 5 | ✅ |
| `test-server-smoke.js` | 6 | ✅ |
| `example-server-verify.js` | 11 steps | ✅ |
