// example-auth-biz.js — register, sign-in, signed input (CEngine2d 1.5, ES5).
// Load order: jsrsasign-all-min.js → CryptoManager → IdentityManager → NetworkManager → this file
// For full HTTPS flows see example-https-biz.js and 06-https-networking.md

var BizAuth = {
  init: function() {
    IdentityManager.init();
    NetworkManager.initialize({ baseUrl: "https://api.example.com" });
  },

  onServerHello: function(serverNonceHex) {
    IdentityManager.onServerHello(serverNonceHex);
    if (typeof cc !== "undefined") {
      cc.log("[BizAuth] server nonce received");
    }
  },

  onRegisterTap: function(username, password) {
    var result = IdentityManager.register(username, password);
    if (!result) {
      BizAuth._log("register failed");
      return null;
    }

    BizAuth._log("register ok, keyId: " + result.record.keyId.substring(0, 16) + "...");
    BizAuth.sendToServer("/api/register", result.request);
    return result.record;
  },

  onLoginTap: function(username, password) {
    // In production, challenge comes from server via POST /api/login/password — not hardcoded.
    IdentityManager.onLoginChallenge("challenge_from_server");

    var result = IdentityManager.signIn(username, password);
    if (!result) {
      BizAuth._log("sign-in failed");
      return null;
    }

    BizAuth._log("sign-in sig: " + result.request.signatureHex.substring(0, 16) + "...");
    BizAuth.sendToServer("/api/login/signin", result.request);
    return result;
  },

  onLogoutTap: function() {
    IdentityManager.clearSession();
    BizAuth._log("session cleared");
  },

  onSendInputTap: function(username, text) {
    var packet = IdentityManager.signUserInput(username, text);
    if (!packet) {
      BizAuth._log("sign input failed");
      return null;
    }
    BizAuth.sendToServer("/api/action", packet);
    return packet;
  },

  onTouchMoved: function(x, y) {
    CryptoManager.addTouchEntropy(x, y);
  },

  sendToServer: function(path, payload) {
    // Prefer BizApiClient — see example-https-biz.js
    NetworkManager.post(path || "/api/action", payload, function(res) {
      BizAuth._log(res.ok ? "sent ok" : "send failed: " + res.error);
    });
  },

  _log: function(msg) {
    if (typeof cc !== "undefined") {
      cc.log("[BizAuth] " + msg);
    }
  }
};

// --- Server-side verification (same APIs in your backend logic) ---
//
// if (IdentityManager.verifyRegisterRequest(req)) { save user + pubHex }
// if (IdentityManager.verifySignInRequest(req, storedPubHex)) { issue session }
// if (IdentityManager.verifySignedInput(packet)) { accept command }
