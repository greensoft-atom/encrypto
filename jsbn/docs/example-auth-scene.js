// Example: register, sign-in, and signed user input (CEngine2d 1.5 style).
// Load jsbn scripts first (see CEngine.md load order).

var UserAuth = {
  STORAGE_KEY: "user_identity_v1",
  SERVER_NONCE: "",
  SERVER_CHALLENGE: "",

  init: function() {
    CEngineSec.setErrorHandler(function(msg) {
      cc.log("[auth] " + msg);
    });
  },

  onServerHello: function(serverNonceHex) {
    UserAuth.SERVER_NONCE = serverNonceHex;
    var serverBytes = CEngineSec.hexToBytes(serverNonceHex);
    if(serverBytes.length === 0) {
      cc.log("invalid server nonce");
      return;
    }
    CEngineSec.seedRandom(serverBytes.concat(CEngineSec.gatherEntropyBytes(32)));
  },

  register: function(username, password) {
    var identity = CEngineSec.createUserIdentity();
    if(identity == null) {
      cc.log("keygen failed");
      return null;
    }

    var req = CEngineSec.buildRegisterRequest(
      username, password, identity, UserAuth.SERVER_NONCE
    );
    if(req == null) {
      cc.log("register request failed");
      return null;
    }

    var record = CEngineSec.identityToStorage(username, identity);
    if(!CEngineSec.saveUserLocal(UserAuth.STORAGE_KEY, record)) {
      cc.log("local save failed (cc.sys.localStorage or JSON missing?)");
    }

    cc.log("register pub: " + req.pubHex.substring(0, 20) + "...");
    sendToServer(req);
    return record;
  },

  signIn: function(username) {
    var identity = CEngineSec.loadUserLocal(UserAuth.STORAGE_KEY);
    if(identity == null || identity.username != username) {
      cc.log("no local identity for " + username);
      return null;
    }

    CEngineSec.seedFromEnvironment(CEngineSec.hexToBytes(UserAuth.SERVER_NONCE));

    var req = CEngineSec.buildSignInRequest(
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

  signInput: function(username, text) {
    var identity = CEngineSec.loadUserLocal(UserAuth.STORAGE_KEY);
    if(identity == null) return null;

    var sig = CEngineSec.signUserInput(identity.privHex, text);
    if(sig == null) return null;

    var packet = CEngineSec.wrapSignedInput(username, identity.pubHex, text, sig);
    sendToServer(packet);
    return packet;
  },

  verifyIncomingInput: function(packet) {
    return CEngineSec.verifySignedInput(packet);
  }
};

function sendToServer(payload) {
  // HTTP / WebSocket — JSON.stringify(payload) when JSON is available
}
