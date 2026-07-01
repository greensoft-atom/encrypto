# Node.js server for jsbn / CEngineSec APK

Reference HTTP server that verifies the **same auth protocol** as the CEngine2d client. Uses `CEngineSec` loaded from `../` jsbn scripts (identical math to the APK).

**Requires:** Node.js **12.x** or newer (tested pattern; no npm dependencies).

## Quick start

```bash
cd jsbn/server
node test-server-smoke.js   # offline verification tests
node server.js              # HTTP on http://127.0.0.1:3000
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/hello` | Issue `serverNonce`, return server RSA `n` + `e` |
| POST | `/api/register` | Verify register signature, store `username` + `pubHex` |
| GET | `/api/signin/start?username=alice` | Issue `serverNonce` + `serverChallenge` |
| POST | `/api/signin` | Verify sign-in signature, return `sessionToken` |
| POST | `/api/game/input` | Verify signed game/chat input (`Authorization: Bearer …`) |
| POST | `/api/login/rsa-decrypt` | Demo: decrypt RSA ciphertext from client |

## Example curl flow

```bash
# 1) Hello
curl -s http://127.0.0.1:3000/api/hello

# 2) Register (body from CEngineSec.buildRegisterRequest on client)
curl -s -X POST http://127.0.0.1:3000/api/register \
  -H "Content-Type: application/json" \
  -d @register.json

# 3) Sign-in challenge
curl -s "http://127.0.0.1:3000/api/signin/start?username=alice"

# 4) Sign-in (body from CEngineSec.buildSignInRequest)
curl -s -X POST http://127.0.0.1:3000/api/signin \
  -H "Content-Type: application/json" \
  -d @signin.json

# 5) Signed input
curl -s -X POST http://127.0.0.1:3000/api/game/input \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -d @input.json
```

## Production notes

- Replace in-memory `users` / `sessions` with a database.
- Enforce HTTPS in front of this service (nginx, load balancer).
- Rate-limit register and sign-in endpoints.
- Store only `passwordHash` and `pubHex` — never the client `privHex`.
- ECDSA verify uses **SHA-256 + P-384**, not SHA384withECDSA.

Full beginner walkthrough with exact field values: [../BEGINNER-GUIDE.md](../BEGINNER-GUIDE.md).
