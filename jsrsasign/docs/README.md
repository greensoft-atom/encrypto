# jsrsasign for CEngine2d — Documentation Index

Practical guides and copy-paste-ready code for using **jsrsasign** in a legacy CEngine2d 1.5 / SpiderMonkey runtime (no Node.js, no WebCrypto, no ES modules).

These docs synthesize the architecture discussions in [discussion_01.md](./discussion_01.md) and [discussion_02.md](./discussion_02.md) into actionable material.

---

## Read in this order

| # | Document | What you get |
|---|----------|--------------|
| 1 | [01-getting-started.md](./01-getting-started.md) | Runtime constraints, how to load the library, first hash/sign/verify |
| 2 | [02-jsrsasign-core-api.md](./02-jsrsasign-core-api.md) | Direct jsrsasign API cheat sheet with minimal examples |
| 3 | [03-architecture.md](./03-architecture.md) | Layered design: Biz → IdentityManager → CryptoManager → jsrsasign |
| 4 | [04-auth-flows.md](./04-auth-flows.md) | Registration, login, signed user actions — sequence diagrams and payloads |
| 5 | [05-algorithms-and-security.md](./05-algorithms-and-security.md) | Algorithm choices, performance, pitfalls, library EOL notice |
| 6 | [06-https-networking.md](./06-https-networking.md) | **HTTPS via XMLHttpRequest** — NetworkManager, BizApiClient, full auth flows |
| — | [REVIEW.md](./REVIEW.md) | Review findings, fixes applied, known limitations |

---

## Runnable example code

All files are **ES5-compatible** (no `let`, `const`, arrow functions, or `require`).

```
docs/examples/
├── CryptoManager.js         ← Public crypto facade (wraps jsrsasign)
├── IdentityManager.js       ← User registration / login / signed input
├── NetworkManager.js        ← HTTPS client (XMLHttpRequest, no Java code)
├── BizApiClient.js          ← Register / login / actions over HTTPS
├── example-auth-biz.js      ← Crypto-only biz integration pattern
├── example-https-biz.js     ← Full HTTPS + crypto biz integration
├── network-probe.js         ← Minimal HTTPS connectivity test
├── CENGINE.md               ← Script load order and project layout
├── test-smoke.js            ← Node smoke test (CryptoManager)
└── test-network-smoke.js    ← Node smoke test (NetworkManager mock)
```

### Quick start (Node smoke test)

From the repo root:

```bash
node jsrsasign/docs/examples/test-smoke.js
node jsrsasign/docs/examples/test-network-smoke.js
```

### Quick start (CEngine2d)

1. Copy `jsrsasign/jsrsasign-all-min.js` into your project `src/crypto/` folder.
2. Copy `docs/examples/CryptoManager.js`, `IdentityManager.js`, `NetworkManager.js`, and `BizApiClient.js`.
3. Follow [examples/CENGINE.md](./examples/CENGINE.md) for load order.
4. Read [06-https-networking.md](./06-https-networking.md) for HTTPS register/login flows.

---

## Recommended defaults for this project

| Use case | Algorithm |
|----------|-----------|
| User identity key pair | **EC P-384** (`secp384r1`) |
| Sign biz actions / auth payloads | **SHA384withECDSA** |
| Verify server config / assets | **RSA-2048** or **EC P-384** |
| Integrity hashing | **SHA-256** or **SHA-384** |
| Password storage (server) | Salt + iterated SHA-256 behind `Password` service* |

\* Upgrade to PBKDF2/scrypt on the server when available. Never store raw passwords or plain `SHA256(password)`.

---

## Key principle (from discussion_02)

> **Cryptography is not authentication.**

- `CryptoManager` — keys, hashes, signatures, encryption only.
- `IdentityManager` — users, sessions, registration, login.
- Biz logic never imports jsrsasign directly.

---

## External references

- [jsrsasign official site](https://kjur.github.io/jsrsasign/)
- [API reference](https://kjur.github.io/jsrsasign/api/)
- [Programming tutorials](https://github.com/kjur/jsrsasign/wiki#programming-tutorial)
- Bundled samples: `jsrsasign/sample/sample-rsasign.html`, `sample-ecdsa.html`
