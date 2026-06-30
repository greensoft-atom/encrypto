# CEngine2d Integration

## Recommended project layout

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
    example-auth-biz.js
    network-probe.js
```

## Script load order

Load **exactly in this order** (dependencies first):

```javascript
// project.json or main.js bootstrap
require("src/crypto/jsrsasign-all-min.js");
require("src/crypto/CryptoManager.js");
require("src/crypto/IdentityManager.js");
require("src/network/NetworkManager.js");
require("src/network/BizApiClient.js");
require("src/biz/example-https-biz.js");
```

If your project uses `js.include`:

```javascript
js.include("crypto/jsrsasign-all-min.js");
js.include("crypto/CryptoManager.js");
js.include("crypto/IdentityManager.js");
js.include("network/NetworkManager.js");
js.include("network/BizApiClient.js");
```

**Never** load `CryptoManager.js` before `jsrsasign-all-min.js`.

## File sizes (approximate)

| File | Size |
|------|------|
| jsrsasign-all-min.js | ~350 KB |
| CryptoManager.js | ~12 KB |
| IdentityManager.js | ~8 KB |
| NetworkManager.js | ~6 KB |
| BizApiClient.js | ~5 KB |

Plan APK size accordingly. The all-in-one bundle is larger than the jsbn split stack but includes PEM, X.509, and full KEYUTIL.

## Bootstrap in your first view

```javascript
var HelloView = cc.Scene.extend({
  onEnter: function() {
    this._super();
    IdentityManager.init();
    cc.log("CryptoManager " + CryptoManager.version());

    var h = CryptoManager.sha256("test");
    cc.log("sha256 self-check len: " + h.length); // 64
  }
});
```

## Entropy before key generation

Call before `register` or any `generateECC`:

```javascript
IdentityManager.onServerHello(serverNonceHex);

// During biz runtime — mix touch input
cc.eventManager.addListener({
  event: cc.EventListener.TOUCH_ONE_BY_ONE,
  onTouchMoved: function(touch) {
    var p = touch.getLocation();
    CryptoManager.addTouchEntropy(p.x, p.y);
    return true;
  }
}, this);
```

For production key generation, prefer mixing entropy from an **Android native secure random** bridge when available.

## HTTPS networking (no Java code)

TLS is handled by the CEngine2d runtime. Your biz scripts use **`XMLHttpRequest` from JavaScript**:

```javascript
BizApiClient.init({ baseUrl: "https://api.example.com" });

BizApiClient.probeHttps(function(r) {
  cc.log(r.ok ? "HTTPS OK" : "HTTPS failed: " + r.error);
});

BizApiClient.register("alice", "secret123", function(res) { /* ... */ });
BizApiClient.login("alice", "secret123", function(res) { /* ... */ });
BizApiClient.sendAction("alice", "move north", function(res) { /* ... */ });
```

Full guide: [../06-https-networking.md](../06-https-networking.md)

## Session lifecycle

`signUserInput()` requires a prior successful `signIn()` (or `unlockSession()`). The private key lives in memory only until `IdentityManager.clearSession()` is called (e.g. on logout).

```javascript
IdentityManager.signIn(username, password);   // unlocks session
IdentityManager.signUserInput(username, text);
IdentityManager.clearSession();               // on logout
```

## localStorage

`IdentityManager.saveLocal` uses `cc.sys.localStorage`. On Android this persists across sessions. Treat stored private key material as sensitive — `privEnc` in the record is minimal obfuscation; upgrade to AES + KDF for release builds.

## What biz code should import

| Allowed | Not allowed |
|---------|-------------|
| `CryptoManager.*` | `KEYUTIL` |
| `IdentityManager.*` | `KJUR.crypto.*` |
| `NetworkManager.*` | `RSAKey` |
| `BizApiClient.*` | Direct `XMLHttpRequest` scattered everywhere* |

\* Prefer `NetworkManager` / `BizApiClient` over raw XHR in biz code for consistency.

## Node smoke test (before deploying to device)

From repo root:

```bash
node jsrsasign/docs/examples/test-smoke.js
node jsrsasign/docs/examples/test-network-smoke.js
```

Validates CryptoManager + IdentityManager without CEngine2d.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `KEYUTIL is not defined` | Load jsrsasign-all-min.js first |
| Keygen hangs | RSA 2048 is slow in pure JS; use EC P-384 for user keys |
| Verify always false | Check canonical string matches server byte-for-byte |
| `cc.sys.localStorage` null | Test on device; some simulators lack storage |
| `XMLHttpRequest not available` | Engine lacks JS network — see [06-https-networking.md](../06-https-networking.md) |
| HTTPS `NETWORK_ERROR` | Test with `network-probe.js`; check cert and engine SSL |

## See also

- [../01-getting-started.md](../01-getting-started.md)
- [../04-auth-flows.md](../04-auth-flows.md)
- [../06-https-networking.md](../06-https-networking.md)
