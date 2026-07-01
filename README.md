# encrypto

Pure JavaScript cryptography for **CEngine2d 1.5** Android — no Node.js, no browser, no native Java bindings required for basic use.

Use this repo to add **RSA**, **EC P-384 (ECDH/ECDSA)**, **user registration / login**, **signed biz actions**, and **HTTPS API calls** to a legacy SpiderMonkey runtime.

---

## What's inside

| Folder | Purpose |
|--------|---------|
| [`jsbn/`](jsbn/) | Lightweight stack — Tom Wu jsbn + `CEngineSec` (RSA-2048, ECDH/ECDSA P-384) |
| [`jsrsasign/`](jsrsasign/) | Full stack — jsrsasign bundle + docs, facades, HTTPS helpers |

Pick **one** stack per project. Do not mix both in the same APK unless you have a strong reason.

---

## Quick start

### Option A — jsbn (smaller, fewer files)

1. Read [`jsbn/BEGINNER-GUIDE.md`](jsbn/BEGINNER-GUIDE.md) (concepts, exact values, call flows)
2. Read [`jsbn/CEngine.md`](jsbn/CEngine.md) (integration checklist)
3. Copy the `jsbn/` scripts into your project in the documented load order
4. Run reference server: `node jsbn/server/server.js`
5. Use `CEngineSec` from [`jsbn/cengine-sec.js`](jsbn/cengine-sec.js)

```bash
node jsbn/test-smoke.js
```

### Option B — jsrsasign (PEM, X.509, richer API)

1. Read [`jsrsasign/docs/README.md`](jsrsasign/docs/README.md)
2. Copy `jsrsasign/jsrsasign-all-min.js` and files from [`jsrsasign/docs/examples/`](jsrsasign/docs/examples/) — **include `cengine-bootstrap.js`**
3. Follow [`jsrsasign/docs/examples/CENGINE.md`](jsrsasign/docs/examples/CENGINE.md)

```bash
node jsrsasign/docs/examples/test-smoke.js
node jsrsasign/docs/examples/test-network-smoke.js
node jsrsasign/docs/examples/test-server-smoke.js
node jsrsasign/docs/examples/example-server-verify.js
cd jsrsasign/docs/examples/server && npm install && npm start
# second terminal: npm run test-client
```

---

## Recommended layout (jsrsasign path)

```text
src/
  crypto/          jsrsasign-all-min.js, CryptoManager.js, IdentityManager.js
  network/         NetworkManager.js, BizApiClient.js
  biz/             your views / workflows
```

Biz code calls **`CryptoManager`**, **`IdentityManager`**, and **`BizApiClient`** — not jsrsasign directly.

---

## HTTPS (no Android Java code)

TLS is handled by the CEngine2d runtime via **`XMLHttpRequest`**:

```javascript
BizApiClient.init({ baseUrl: "https://api.example.com" });
BizApiClient.login("alice", "secret123", function(res) { /* ... */ });
```

Details: [`jsrsasign/docs/06-https-networking.md`](jsrsasign/docs/06-https-networking.md)

---

## Defaults (by stack)

| Use case | **jsbn** (`CEngineSec`) | **jsrsasign** (`CryptoManager`) |
|----------|-------------------------|----------------------------------|
| User identity keys | EC P-384 (`secp384r1`) | EC P-384 (`secp384r1`) |
| Sign auth / biz payloads | **SHA-256 + ECDSA P-384** | **SHA384withECDSA** |
| Integrity hashing | SHA-256 | SHA-256 |
| RSA transport | RSA-2048 PKCS#1 encrypt | RSA-2048 + PEM/X.509 |

**Important:** jsbn and jsrsasign use **different ECDSA hash algorithms**. Your server must match the stack in the APK. See [`jsbn/CEngine.md`](jsbn/CEngine.md#do-not-mix-jsbn-auth-with-jsrsasign-auth).

---

## Documentation map

| Topic | Where |
|-------|-------|
| jsbn beginner guide (concepts + exact values + flows) | [`jsbn/BEGINNER-GUIDE.md`](jsbn/BEGINNER-GUIDE.md) |
| jsbn integration + audit + auth protocol | [`jsbn/CEngine.md`](jsbn/CEngine.md) |
| jsbn Node.js 12 server | [`jsbn/server/server.js`](jsbn/server/server.js) |
| jsbn example code | [`jsbn/example-auth-scene.js`](jsbn/example-auth-scene.js) |
| jsbn verify tests | `node jsbn/test-smoke.js` |
| jsrsasign getting started | [`jsrsasign/docs/01-getting-started.md`](jsrsasign/docs/01-getting-started.md) |
| Architecture (Biz → Crypto → jsrsasign) | [`jsrsasign/docs/03-architecture.md`](jsrsasign/docs/03-architecture.md) |
| Auth flows (register, login, signed input) | [`jsrsasign/docs/04-auth-flows.md`](jsrsasign/docs/04-auth-flows.md) |
| **Beginner step-by-step (exact values & call flows)** | [`jsrsasign/docs/07-beginner-crypto-walkthrough.md`](jsrsasign/docs/07-beginner-crypto-walkthrough.md) |
| HTTPS networking | [`jsrsasign/docs/06-https-networking.md`](jsrsasign/docs/06-https-networking.md) |
| jsrsasign deep audit | [`jsrsasign/docs/AUDIT.md`](jsrsasign/docs/AUDIT.md) |
| jsrsasign Express API server (Node backend) | [`jsrsasign/docs/examples/server/README.md`](jsrsasign/docs/examples/server/README.md) |

---

## License

- **jsbn** — see upstream Tom Wu / Stanford terms in [`jsbn/README.md`](jsbn/README.md)
- **jsrsasign** — MIT, see [`jsrsasign/LICENSE.txt`](jsrsasign/LICENSE.txt)
