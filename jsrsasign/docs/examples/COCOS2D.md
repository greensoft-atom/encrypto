# Cocos2d-JS Integration

## Recommended project layout

```text
src/
  crypto/
    jsrsasign-all-min.js     ← copy from jsrsasign/jsrsasign-all-min.js
    CryptoManager.js         ← copy from docs/examples/
    IdentityManager.js
  scenes/
    AuthScene.js             ← copy/adapt example-auth-scene.js
```

## Script load order

Load **exactly in this order** (dependencies first):

```javascript
// project.json or main.js bootstrap
require("src/crypto/jsrsasign-all-min.js");
require("src/crypto/CryptoManager.js");
require("src/crypto/IdentityManager.js");
require("src/scenes/AuthScene.js");
```

If your project uses `js.include`:

```javascript
js.include("crypto/jsrsasign-all-min.js");
js.include("crypto/CryptoManager.js");
js.include("crypto/IdentityManager.js");
```

**Never** load `CryptoManager.js` before `jsrsasign-all-min.js`.

## File sizes (approximate)

| File | Size |
|------|------|
| jsrsasign-all-min.js | ~350 KB |
| CryptoManager.js | ~12 KB |
| IdentityManager.js | ~8 KB |

Plan APK size accordingly. The all-in-one bundle is larger than the jsbn split stack but includes PEM, X.509, and full KEYUTIL.

## Bootstrap in your first scene

```javascript
var HelloScene = cc.Scene.extend({
  onEnter: function() {
    this._super();
    IdentityManager.init();
    cc.log("CryptoManager " + CryptoManager.version());

    // Optional: verify library
    var h = CryptoManager.sha256("test");
    cc.log("sha256 self-check len: " + h.length); // 64
  }
});
```

## Entropy before key generation

Call before `register` or any `generateECC`:

```javascript
// After server hello
IdentityManager.onServerHello(serverNonceHex);

// During gameplay — mix touch input
cc.eventManager.addListener({
  event: cc.EventListener.TOUCH_ONE_BY_ONE,
  onTouchMoved: function(touch) {
    var p = touch.getLocation();
    CryptoManager.addTouchEntropy(p.x, p.y);
    return true;
  }
}, this);
```

For production key generation, prefer mixing entropy from an **Android native secure random** bridge.

## Session lifecycle

`signUserInput()` requires a prior successful `signIn()` (or `unlockSession()`). The private key lives in memory only until `IdentityManager.clearSession()` is called (e.g. on logout).

```javascript
IdentityManager.signIn(username, password);   // unlocks session
IdentityManager.signUserInput(username, text);
IdentityManager.clearSession();               // on logout
```

## localStorage

`IdentityManager.saveLocal` uses `cc.sys.localStorage`. On Android this persists across sessions. Treat stored private key material as sensitive — `privEnc` in the record is minimal obfuscation; upgrade to AES + KDF for release builds.

## What game code should import

| Allowed | Not allowed |
|---------|-------------|
| `CryptoManager.*` | `KEYUTIL` |
| `IdentityManager.*` | `KJUR.crypto.*` |
| | `RSAKey` |

## Node smoke test (before deploying to device)

From repo root:

```bash
node jsrsasign/docs/examples/test-smoke.js
```

Validates CryptoManager + IdentityManager without Cocos2d.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `KEYUTIL is not defined` | Load jsrsasign-all-min.js first |
| Keygen hangs | RSA 2048 is slow in pure JS; use EC P-384 for user keys |
| Verify always false | Check canonical string matches server byte-for-byte |
| `cc.sys.localStorage` null | Test on device; some simulators lack storage |

## See also

- [../01-getting-started.md](../01-getting-started.md)
- [../04-auth-flows.md](../04-auth-flows.md)
