// Example: register, sign-in, and signed user input (Cocos2d 1.5 style).
// Load jsbn scripts first (see COCOS2D.md load order).

var UserAuth = {
  STORAGE_KEY: "user_identity_v1",
  SERVER_NONCE: "",
  SERVER_CHALLENGE: "",

  init: function() {
    CocosSec.setErrorHandler(function(msg) {
      cc.log("[auth] " + msg);
    });
  },

  // Step 1: server hello -> store nonce, seed RNG
  onServerHello: function(serverNonceHex) {
    UserAuth.SERVER_NONCE = serverNonceHex;
    var combined = CocosSec.hexToBytes(serverNonceHex)
      .concat(CocosSec.gatherEntropyBytes(32));
    CocosSec.seedRandom(combined);
  },

  // Step 2: register new user
  register: function(username, password) {
    var identity = CocosSec.createUserIdentity();
    if(identity == null) {
      cc.log("keygen failed");
      return null;
    }

    var req = CocosSec.buildRegisterRequest(
      username, password, identity, UserAuth.SERVER_NONCE
    );
    if(req == null) {
      cc.log("register request failed");
      return null;
    }

    var record = CocosSec.identityToStorage(username, identity);
    CocosSec.saveUserLocal(UserAuth.STORAGE_KEY, record);

    cc.log("register pub: " + req.pubHex.substring(0, 20) + "...");
    sendToServer(req);
    return record;
  },

  // Step 3: sign in existing user
  signIn: function(username) {
    var identity = CocosSec.loadUserLocal(UserAuth.STORAGE_KEY);
    if(identity == null || identity.username != username) {
      cc.log("no local identity for " + username);
      return null;
    }

    CocosSec.seedFromEnvironment(
      CocosSec.hexToBytes(UserAuth.SERVER_NONCE)
    );

    var req = CocosSec.buildSignInRequest(
      username,
      identity,
      UserAuth.SERVER_CHALLENGE,
      UserAuth.SERVER_NONCE
    );
    if(req == null) {
      cc.log("signin request failed");
      return null;
    }

    cc.log("signin sig prefix: " + req.signatureHex.substring(0, 20) + "...");
    sendToServer(req);
    return req;
  },

  // Step 4: sign user chat / command input
  signInput: function(username, text) {
    var identity = CocosSec.loadUserLocal(UserAuth.STORAGE_KEY);
    if(identity == null) return null;

    var sig = CocosSec.signUserInput(identity.privHex, text);
    if(sig == null) return null;

    var packet = CocosSec.wrapSignedInput(username, identity.pubHex, text, sig);
    sendToServer(packet);
    return packet;
  },

  // Server-side or peer verification example
  verifyIncomingInput: function(packet) {
    return CocosSec.verifySignedInput(packet);
  }
};

function sendToServer(payload) {
  // HTTP / WebSocket — JSON.stringify(payload)
}

// --- Server-side verification (same CocosSec API in your backend logic) ---
//
// if (CocosSec.verifyRegisterRequest(req)) { save req.pubHex for username }
// if (CocosSec.verifySignInRequest(req)) { issue session token }
// if (CocosSec.verifySignedInput(packet)) { accept user command }
