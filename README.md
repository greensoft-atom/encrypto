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

1. Read [`jsbn/CEngine.md`](jsbn/CEngine.md)
2. Copy the `jsbn/` scripts into your project in the documented load order
3. Use `CEngineSec` from [`jsbn/cengine-sec.js`](jsbn/cengine-sec.js)

```bash
node jsbn/test-smoke.js
```

### Option B — jsrsasign (PEM, X.509, richer API)

1. Read [`jsrsasign/docs/README.md`](jsrsasign/docs/README.md)
2. Copy `jsrsasign/jsrsasign-all-min.js` and files from [`jsrsasign/docs/examples/`](jsrsasign/docs/examples/)
3. Follow [`jsrsasign/docs/examples/CENGINE.md`](jsrsasign/docs/examples/CENGINE.md)

```bash
node jsrsasign/docs/examples/test-smoke.js
node jsrsasign/docs/examples/test-network-smoke.js
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

## Defaults

| Use case | Algorithm |
|----------|-----------|
| User identity keys | EC P-384 (`secp384r1`) |
| Sign auth / biz payloads | SHA384withECDSA |
| Integrity hashing | SHA-256 |
| Server config verify | RSA-2048 or EC P-384 |

---

## Documentation map

| Topic | Where |
|-------|-------|
| jsbn integration | [`jsbn/CEngine.md`](jsbn/CEngine.md) |
| jsrsasign getting started | [`jsrsasign/docs/01-getting-started.md`](jsrsasign/docs/01-getting-started.md) |
| Architecture (Biz → Crypto → jsrsasign) | [`jsrsasign/docs/03-architecture.md`](jsrsasign/docs/03-architecture.md) |
| Auth flows (register, login, signed input) | [`jsrsasign/docs/04-auth-flows.md`](jsrsasign/docs/04-auth-flows.md) |
| HTTPS networking | [`jsrsasign/docs/06-https-networking.md`](jsrsasign/docs/06-https-networking.md) |

---

## License

- **jsbn** — see upstream Tom Wu / Stanford terms in [`jsbn/README.md`](jsbn/README.md)
- **jsrsasign** — MIT, see [`jsrsasign/LICENSE.txt`](jsrsasign/LICENSE.txt)
