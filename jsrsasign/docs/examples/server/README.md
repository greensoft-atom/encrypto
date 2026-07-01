# Express API server (ServerAuth)

Minimal Node.js backend for the CEngine2d jsrsasign auth stack. Uses the **same** `ServerAuth.js` / `IdentityManager.js` verify logic as the client.

## Quick start

```bash
cd jsrsasign/docs/examples/server
npm install
npm start
```

Server listens on `http://0.0.0.0:3000`.

## Test end-to-end

Terminal 1:

```bash
npm start
```

Terminal 2:

```bash
npm run test-client
```

## API routes

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/hello` | — | `{ serverNonce, serverTime }` |
| POST | `/api/register` | register payload (signed) | `{ ok, username, keyId }` |
| POST | `/api/login/password` | `{ username, passwordHash }` | `{ challenge, serverNonce }` |
| POST | `/api/login/signin` | signin payload (signed) | `{ sessionToken }` |
| POST | `/api/action` | signed input packet | `{ ok, text }` |
| GET | `/api/config` | — | demo config |
| GET | `/health` | — | `{ ok: true }` |

`POST /api/action` requires header: `Authorization: Bearer <sessionToken>`

## Wire CEngine2d client

```javascript
BizApiClient.init({ baseUrl: "http://YOUR_PC_IP:3000" });
BizApiClient.register("alice", "secret123", function(res) { /* ... */ });
```

Use HTTPS in production (reverse proxy / load balancer). This demo uses plain HTTP for local testing.

## Security notes

- **Private keys** stay on device; encrypted with **AES-256-CBC + PBKDF2-HMAC-SHA256** (`privEnc` format `v2|iter|salt|iv|ciphertext|tag`).
- **Server password storage** uses `CryptoManager.hashPassword` over the client transport hash (`USE_PASSWORD_KDF = true` in `ServerAuth.js`).
- Node E2E client uses `agent: false` on HTTP requests (avoids keep-alive issues after long PBKDF2 on the same process).
- Nonces/challenges are in-memory — use Redis + DB for production.
- CORS is `*` for dev only.

## Files

| File | Purpose |
|------|---------|
| `load-crypto.js` | Loads jsrsasign + facades via vm |
| `express-server.js` | Express routes |
| `test-express-client.js` | Node E2E test (no CEngine required) |
