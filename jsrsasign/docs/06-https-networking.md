# 06 — HTTPS Networking with XMLHttpRequest

Complete guide for **HTTPS API calls** in CEngine2d 1.5 Android **without writing Java code**.

TLS/SSL is handled by the **CEngine2d engine** (native C++ inside your APK). your biz app calls **`XMLHttpRequest` from JavaScript** — the same API used in browsers.

Runnable code lives in [examples/](./examples/):

| File | Role |
|------|------|
| [NetworkManager.js](./examples/NetworkManager.js) | Generic HTTPS GET/POST wrapper |
| [BizApiClient.js](./examples/BizApiClient.js) | Register / login / signed actions over HTTPS |
| [example-https-biz.js](./examples/example-https-biz.js) | Full biz integration |
| [network-probe.js](./examples/network-probe.js) | Minimal HTTPS connectivity test |

---

## You do NOT write Android Java

```text
┌──────────────────────────────────────────────────────────┐
│  Your JavaScript (biz code)                             │
│                                                          │
│  BizApiClient.login("alice", "pass", callback)          │
│       │                                                  │
│       ▼                                                  │
│  NetworkManager.post("https://api.example.com/...", ...) │
│       │                                                  │
│       ▼                                                  │
│  var xhr = new XMLHttpRequest();   ← JavaScript API      │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│  CEngine2d engine (already in APK — C++/native, not your   │
│  Java source code)                                       │
│                                                          │
│  TCP + TLS 1.2 + certificate validation                  │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
                      Your HTTPS server
```

**What you write:** JavaScript only.  
**What you do not write:** OkHttp, HttpURLConnection, Android Activity networking code.

---

## Full stack architecture

```text
Biz layer / UI
      │
      ▼
BizApiClient          ← register, login, sendAction (HTTPS + crypto)
      │
      ├── NetworkManager     ← XMLHttpRequest, JSON, headers, tokens
      │
      └── IdentityManager    ← sign payloads (ECDSA P-384)
              │
              ▼
          CryptoManager → jsrsasign
```

| Layer | Responsibility |
|-------|----------------|
| **NetworkManager** | Transport: HTTPS, timeouts, JSON, session token header |
| **IdentityManager** | Crypto auth: keygen, sign register/login/actions |
| **BizApiClient** | Orchestration: hello → register/login → signed POST |

jsrsasign does **not** implement TLS. It signs **payloads sent inside** HTTPS.

---

## Step 0 — Verify HTTPS on your APK

Before integrating, run on a **real Android device**:

```javascript
// Copy from examples/network-probe.js or paste inline:
NetworkProbe.run("https://httpbin.org/get", function(r) {
  cc.log(JSON.stringify(r));
  // expect: { "ok": true, "status": 200, ... }
});
```

Or test your own API:

```javascript
NetworkProbe.run("https://api.example.com/api/hello", function(r) {
  if (!r.ok) {
    cc.log("Fix HTTPS before continuing: " + r.message);
  }
});
```

| Result | Meaning |
|--------|---------|
| `ok: true`, status 200 | HTTPS works — proceed with NetworkManager |
| `XHR_UNAVAILABLE` | Engine has no JS network — cannot fix with JS alone |
| `NETWORK_ERROR` | SSL not in engine build, bad cert, or firewall |
| `TIMEOUT` | Server unreachable or very slow |

---

## Step 1 — Copy files and load order

```text
src/
  crypto/
    jsrsasign-all-min.js
    CryptoManager.js
    IdentityManager.js
  network/
    NetworkManager.js
    BizApiClient.js
  biz/
    example-https-biz.js
    network-probe.js          ← optional, for testing
```

```javascript
require("src/crypto/jsrsasign-all-min.js");
require("src/crypto/CryptoManager.js");
require("src/crypto/IdentityManager.js");
require("src/network/NetworkManager.js");
require("src/network/BizApiClient.js");
require("src/biz/example-https-biz.js");
```

---

## Step 2 — Initialize BizApiClient

```javascript
BizApiClient.init({
  baseUrl: "https://api.example.com",
  timeoutMs: 30000,
  endpoints: {
    hello: "/api/hello",
    register: "/api/register",
    loginPassword: "/api/login/password",
    loginSignin: "/api/login/signin",
    action: "/api/action",
    config: "/api/config"
  },
  log: function(msg) { cc.log(msg); }
});
```

---

## Step 3 — Complete usage scenarios

### Scenario A — Probe HTTPS

```javascript
BizApiClient.probeHttps(function(res) {
  if (res.ok) {
    cc.log("HTTPS ready, status=" + res.status);
  } else {
    cc.log("HTTPS failed: " + res.error);
  }
});
```

### Scenario B — Register new user (full flow)

```text
Client                              Server
  │                                    │
  │  GET /api/hello                    │
  │ ─────────────────────────────────► │
  │ ◄───────────────────────────────── │  { serverNonce }
  │                                    │
  │  generate EC P-384 key pair        │
  │  sign register payload             │
  │                                    │
  │  POST /api/register (signed JSON)  │
  │ ─────────────────────────────────► │
  │ ◄───────────────────────────────── │  201 Created
  │                                    │
  │  save privEnc locally              │
```

```javascript
BizApiClient.register("alice", "MyPassword123", function(res) {
  if (!res.ok) {
    cc.log("Register failed: " + res.error);
    return;
  }
  cc.log("Registered! keyId=" + res.record.keyId.substring(0, 16));
  goToLoginScreen();
});
```

**What happens internally:**

1. `GET /api/hello` → receives `serverNonce`
2. `IdentityManager.onServerHello(nonce)` → seeds RNG
3. `IdentityManager.register()` → keygen + local save + signed payload
4. `POST /api/register` with signed JSON over HTTPS

### Scenario C — Login (password + key proof)

```text
Client                              Server
  │                                    │
  │  GET /api/hello                    │
  │ ─────────────────────────────────► │
  │ ◄ serverNonce                      │
  │                                    │
  │  POST /api/login/password          │
  │  { username, passwordHash }        │
  │ ─────────────────────────────────► │
  │ ◄ { challenge, serverNonce }       │
  │                                    │
  │  unlock local key with password    │
  │  sign signin payload               │
  │                                    │
  │  POST /api/login/signin (signed)   │
  │ ─────────────────────────────────► │
  │ ◄ { sessionToken }                 │
  │                                    │
  │  session unlocked in memory        │
```

```javascript
BizApiClient.login("alice", "MyPassword123", function(res) {
  if (!res.ok) {
    cc.log("Login failed: " + res.error);
    return;
  }
  cc.log("Logged in, token=" + res.sessionToken);
  goToMainBizView();
});
```

After login, `NetworkManager` sends `Authorization: Bearer <sessionToken>` on subsequent requests.

### Scenario D — Send signed biz action

```javascript
// Must call login() first — session must be unlocked
BizApiClient.sendAction("alice", "move north", function(res) {
  if (!res.ok) {
    cc.log("Action rejected: " + res.error);
    return;
  }
  cc.log("Server accepted command");
});
```

**POST body** (signed over HTTPS):

```json
{
  "username": "alice",
  "pubHex": "04...",
  "curve": "secp384r1",
  "text": "move north",
  "signatureHex": "304...",
  "timestamp": 1750000002000
}
```

### Scenario E — Logout

```javascript
BizApiClient.logout();
// Clears in-memory private key + session token
```

### Scenario F — Raw HTTPS (without auth)

Use `NetworkManager` directly for non-auth API calls:

```javascript
NetworkManager.initialize({ baseUrl: "https://api.example.com" });

NetworkManager.get("/api/news", function(res) {
  if (res.ok) {
    cc.log("News: " + JSON.stringify(res.data));
  }
});

NetworkManager.post("/api/telemetry", {
  event: "level_complete",
  level: 3,
  score: 1200
}, function(res) {
  cc.log(res.ok ? "sent" : res.error);
});
```

---

## Server API contract (reference)

Adjust paths in `BizApiClient.ENDPOINTS` to match your backend.

### `GET /api/hello`

Response:

```json
{
  "serverNonce": "8f3c2a1b9d0e4f5678901234567890abcdef0123456789abcdef012345678",
  "serverTime": 1750000000000
}
```

### `POST /api/register`

Request body = output of `IdentityManager.buildRegisterRequest()`:

```json
{
  "action": "register",
  "username": "alice",
  "passwordHash": "sha256hex...",
  "pubHex": "04...",
  "curve": "secp384r1",
  "timestamp": 1750000000000,
  "serverNonce": "...",
  "signatureHex": "304..."
}
```

Server verifies with `IdentityManager.verifyRegisterRequest(req)`.

### `POST /api/login/password`

Request:

```json
{
  "username": "alice",
  "passwordHash": "sha256hex..."
}
```

Response:

```json
{
  "challenge": "a1b2c3d4e5f6...",
  "serverNonce": "..."
}
```

### `POST /api/login/signin`

Request = `IdentityManager.buildSignInRequest()` output.

Response:

```json
{
  "sessionToken": "eyJhbGciOi...",
  "expiresIn": 86400
}
```

### `POST /api/action`

Request = `IdentityManager.signUserInput()` output.

Server verifies with `IdentityManager.verifySignedInput(packet)`.

---

## NetworkManager API reference

```javascript
NetworkManager.initialize({ baseUrl, timeoutMs, headers })
NetworkManager.isAvailable()                    // typeof XMLHttpRequest !== "undefined"
NetworkManager.setSessionToken(token)
NetworkManager.clearSessionToken()
NetworkManager.buildUrl("/api/hello")

NetworkManager.get(path, callback, options)
NetworkManager.post(path, body, callback, options)
NetworkManager.put(path, body, callback, options)
NetworkManager.del(path, callback, options)

NetworkManager.request(method, path, { body, headers, timeoutMs }, callback)
NetworkManager.probe(url, callback)
```

**Callback result shape:**

```javascript
{
  ok: true,           // HTTP 2xx
  status: 200,
  data: { ... },      // parsed JSON or raw string
  raw: "...",
  error: null,
  code: "OK",
  url: "https://..."
}
```

**Error codes:** `XHR_UNAVAILABLE`, `TIMEOUT`, `NETWORK_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `SERVER_ERROR`, `HTTP_ERROR`, `SEND_FAILED`

---

## Biz integration example

See [examples/example-https-biz.js](./examples/example-https-biz.js):

```javascript
var LoginView = cc.Scene.extend({
  onEnter: function() {
    this._super();
    BizHttpsAuth.init();

    BizHttpsAuth.runConnectivityProbe(function(probe) {
      if (!probe.ok) { showNetworkError(); return; }
    });
  },

  onRegisterTap: function() {
    BizHttpsAuth.onRegisterTap("alice", "secret123", function(res) {
      if (res.ok) { showMessage("Account created"); }
    });
  },

  onLoginTap: function() {
    BizHttpsAuth.onLoginTap("alice", "secret123", function(res) {
      if (res.ok) { cc.director.runScene(new MainBizView()); }
    });
  }
});
```

---

## Security notes

| Topic | Guidance |
|-------|----------|
| TLS | Provided by engine via `https://` URLs — do not use plain `http://` for auth |
| Payload signing | ECDSA over canonical strings — see [04-auth-flows.md](./04-auth-flows.md) |
| Session token | Stored in `NetworkManager` memory only — clear on logout |
| Private key | Encrypted locally (`privEnc`) — unlocked only after password at login |
| Certificate pinning | Not in JS — requires engine/native config if needed later |
| jsrsasign role | Signs JSON bodies — does not replace HTTPS |

**Never** send passwords on every signed action. Password is used once at login; afterwards use signatures + session token.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `XMLHttpRequest not available` | Engine build lacks JS network | Engine rebuild or vendor support |
| HTTPS fails, HTTP works | SSL not linked in engine | Rebuild CEngine2d with curl/OpenSSL |
| `NETWORK_ERROR` on valid URL | Wrong cert, self-signed, or Android network security config | Use valid CA cert or configure engine trust |
| Register OK locally, server rejects | Canonical string mismatch | Match server verify to [04-auth-flows.md](./04-auth-flows.md) |
| `NO_SESSION` on sendAction | Login not called or session cleared | Call `BizApiClient.login()` first |
| Timeout | Slow network or blocked firewall | Increase `timeoutMs`, check server |

---

## What NOT to do

```javascript
// BAD — plain HTTP for credentials
xhr.open("POST", "http://api.example.com/register", true);

// BAD — trying to implement TLS in jsrsasign
CryptoManager.encryptRSA(...)  // not for HTTP transport

// BAD — password on every action
NetworkManager.post("/action", { username, password, text });
```

```javascript
// GOOD — HTTPS + signed payload
BizApiClient.sendAction("alice", "move north", callback);
```

---

## Related docs

- [04-auth-flows.md](./04-auth-flows.md) — crypto payloads and canonical strings
- [03-architecture.md](./03-architecture.md) — layer model
- [examples/CENGINE.md](./examples/CENGINE.md) — script load order
- [REVIEW.md](./REVIEW.md) — crypto code audit notes
