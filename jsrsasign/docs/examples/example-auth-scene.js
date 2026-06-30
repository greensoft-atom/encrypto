// Example: register, sign-in, and signed user input (Cocos2d 1.5 style).
// Load order: jsrsasign-all-min.js → CryptoManager.js → IdentityManager.js → this file

var AuthScene = {
  init: function() {
    IdentityManager.init();
  },

  // Server sends nonce on connect
  onServerHello: function(serverNonceHex) {
    IdentityManager.onServerHello(serverNonceHex);
    if (typeof cc !== "undefined") {
      cc.log("[auth] server nonce received");
    }
  },

  onRegisterTap: function(username, password) {
    var result = IdentityManager.register(username, password);
    if (!result) {
      AuthScene._log("register failed");
      return null;
    }

    AuthScene._log("register ok, keyId: " + result.record.keyId.substring(0, 16) + "...");
    AuthScene.sendToServer(result.request);
    return result.record;
  },

  onLoginTap: function(username, password) {
    // Assume server returned challenge after password check
    IdentityManager.onLoginChallenge("challenge_from_server");

    var result = IdentityManager.signIn(username, password);
    if (!result) {
      AuthScene._log("sign-in failed");
      return null;
    }

    AuthScene._log("sign-in sig: " + result.request.signatureHex.substring(0, 16) + "...");
    AuthScene.sendToServer(result.request);
    return result;
  },

  onLogoutTap: function() {
    IdentityManager.clearSession();
    AuthScene._log("session cleared");
  },

  onSendChat: function(username, text) {
    // Requires prior signIn (unlocked session)
    var packet = IdentityManager.signUserInput(username, text);
    if (!packet) {
      AuthScene._log("sign input failed");
      return null;
    }
    AuthScene.sendToServer(packet);
    return packet;
  },

  // Mix touch events into entropy pool during gameplay
  onTouchMoved: function(x, y) {
    CryptoManager.addTouchEntropy(x, y);
  },

  sendToServer: function(payload) {
    // Wire to your HTTP / WebSocket layer:
    // var body = JSON.stringify(payload);
  },

  _log: function(msg) {
    if (typeof cc !== "undefined") {
      cc.log("[AuthScene] " + msg);
    }
  }
};

// --- Server-side verification (same APIs in your backend logic) ---
//
// if (IdentityManager.verifyRegisterRequest(req)) { save user + pubHex }
// if (IdentityManager.verifySignInRequest(req, storedPubHex)) { issue session }
// if (IdentityManager.verifySignedInput(packet)) { accept command }
