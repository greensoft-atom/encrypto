// IdentityManager.js — user registration, login, signed actions (ES5).
// Requires: jsrsasign-all-min.js, CryptoManager.js

var IdentityManager = {
  STORAGE_KEY: "identity_v1",
  SERVER_NONCE: "",
  SERVER_CHALLENGE: "",
  _sessionIdentity: null,

  init: function() {
    CryptoManager.initialize();
  },

  onServerHello: function(serverNonceHex) {
    IdentityManager.SERVER_NONCE = String(serverNonceHex);
    CryptoManager.seedFromEnvironment(serverNonceHex);
  },

  onLoginChallenge: function(challengeHex) {
    IdentityManager.SERVER_CHALLENGE = String(challengeHex);
  },

  _canonical: function(parts) {
    var i, out = "";
    for (i = 0; i < parts.length; ++i) {
      if (i > 0) {
        out += "|";
      }
      out += String(parts[i]);
    }
    return out;
  },

  _passwordTransportHash: function(username, password) {
    return CryptoManager.sha256(String(username) + "|" + String(password));
  },

  createIdentity: function(curve) {
    CryptoManager.seedFromEnvironment(
      IdentityManager.SERVER_NONCE ? IdentityManager.SERVER_NONCE : null
    );
    var kp = CryptoManager.generateECC(curve || CryptoManager.DEFAULT_EC_CURVE);
    if (!kp) {
      return null;
    }
    return {
      handle: kp,
      pubHex: kp.pubHex,
      privHex: kp.privHex,
      curve: kp.curve,
      createdAt: new Date().getTime()
    };
  },

  identityToRecord: function(username, identity, password) {
    var record = {
      version: 1,
      username: String(username),
      pubHex: identity.pubHex,
      curve: identity.curve,
      keyId: CryptoManager.publicKeyFingerprint(identity.handle),
      createdAt: identity.createdAt || new Date().getTime()
    };
    if (password) {
      // Production path: encrypted private key only — no plaintext privHex on disk.
      record.privEnc = IdentityManager._encryptPrivHex(identity.privHex, username, password);
    } else {
      // Dev/test only — omit password to keep plaintext privHex in storage.
      record.privHex = identity.privHex;
    }
    return record;
  },

  _encryptPrivHex: function(privHex, username, password) {
    return CryptoManager.encryptPrivateHex(privHex, username + "|" + password);
  },

  _decryptPrivHex: function(privEnc, username, password) {
    return CryptoManager.decryptPrivateHex(privEnc, username + "|" + password);
  },

  _verifyPrivMatchesPub: function(privHex, pubHex, curve) {
    if (!privHex || !pubHex) {
      return false;
    }
    var curveName = curve || CryptoManager.DEFAULT_EC_CURVE;
    var privHandle = {
      type: "EC",
      curve: curveName,
      privHex: privHex,
      pubHex: pubHex,
      _prv: null,
      _pub: null
    };
    var testMsg = "identity-key-check-v1";
    var sigHex = CryptoManager.signECC(testMsg, privHandle);
    if (!sigHex) {
      return false;
    }
    var pubHandle = {
      type: "EC",
      curve: curveName,
      pubHex: pubHex,
      _pub: null
    };
    return CryptoManager.verifyECC(testMsg, sigHex, pubHandle);
  },

  recordToIdentity: function(record, password) {
    if (!record) {
      return null;
    }
    var privHex = null;
    if (record.privEnc) {
      if (!password) {
        return null;
      }
      privHex = IdentityManager._decryptPrivHex(record.privEnc, record.username, password);
      if (!IdentityManager._verifyPrivMatchesPub(
        privHex, record.pubHex, record.curve || CryptoManager.DEFAULT_EC_CURVE
      )) {
        return null;
      }
    } else if (record.privHex) {
      privHex = record.privHex;
    } else {
      return null;
    }
    var handle = {
      type: "EC",
      curve: record.curve || CryptoManager.DEFAULT_EC_CURVE,
      private: true,
      privHex: privHex,
      pubHex: record.pubHex,
      _prv: null,
      _pub: null
    };
    return {
      handle: handle,
      pubHex: record.pubHex,
      privHex: privHex,
      curve: record.curve,
      username: record.username,
      createdAt: record.createdAt
    };
  },

  unlockSession: function(username, password) {
    var record = IdentityManager.loadLocal();
    if (!record || record.username !== username) {
      return null;
    }
    var identity = IdentityManager.recordToIdentity(record, password);
    if (identity) {
      IdentityManager._sessionIdentity = identity;
    }
    return identity;
  },

  clearSession: function() {
    IdentityManager._sessionIdentity = null;
  },

  clearLocal: function() {
    if (typeof cc === "undefined" || !cc.sys || !cc.sys.localStorage) {
      return false;
    }
    cc.sys.localStorage.removeItem(IdentityManager.STORAGE_KEY);
    IdentityManager.clearSession();
    return true;
  },

  saveLocal: function(record) {
    if (typeof cc === "undefined" || !cc.sys || !cc.sys.localStorage) {
      return false;
    }
    cc.sys.localStorage.setItem(IdentityManager.STORAGE_KEY, JSON.stringify(record));
    return true;
  },

  loadLocal: function() {
    if (typeof cc === "undefined" || !cc.sys || !cc.sys.localStorage) {
      return null;
    }
    var raw = cc.sys.localStorage.getItem(IdentityManager.STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },

  // --- Register ---

  buildRegisterRequest: function(username, password, identity) {
    if (!identity || !identity.privHex || !identity.pubHex) {
      return null;
    }
    if (!IdentityManager.SERVER_NONCE) {
      return null;
    }
    var passwordHash = IdentityManager._passwordTransportHash(username, password);
    var timestamp = new Date().getTime();
    var canonical = IdentityManager._canonical([
      "register", username, passwordHash, identity.pubHex, timestamp, IdentityManager.SERVER_NONCE
    ]);
    var sigHex = CryptoManager.signECC(canonical, identity.handle);
    if (!sigHex) {
      return null;
    }
    return {
      action: "register",
      username: String(username),
      passwordHash: passwordHash,
      pubHex: identity.pubHex,
      curve: identity.curve,
      timestamp: timestamp,
      serverNonce: IdentityManager.SERVER_NONCE,
      signatureHex: sigHex
    };
  },

  verifyRegisterRequest: function(req) {
    if (!req || req.action !== "register") {
      return false;
    }
    var canonical = IdentityManager._canonical([
      "register", req.username, req.passwordHash, req.pubHex, req.timestamp, req.serverNonce
    ]);
    var handle = {
      type: "EC",
      curve: req.curve || CryptoManager.DEFAULT_EC_CURVE,
      pubHex: req.pubHex
    };
    return CryptoManager.verifyECC(canonical, req.signatureHex, handle);
  },

  register: function(username, password) {
    var identity = IdentityManager.createIdentity();
    if (!identity) {
      return null;
    }
    var req = IdentityManager.buildRegisterRequest(username, password, identity);
    if (!req) {
      return null;
    }
    var record = IdentityManager.identityToRecord(username, identity, password);
    if (!IdentityManager.saveLocal(record)) {
      return null;
    }
    return { record: record, request: req };
  },

  // --- Sign in ---

  buildSignInRequest: function(username, identity) {
    if (!identity || !identity.privHex) {
      return null;
    }
    if (!IdentityManager.SERVER_CHALLENGE || !IdentityManager.SERVER_NONCE) {
      return null;
    }
    var timestamp = new Date().getTime();
    var canonical = IdentityManager._canonical([
      "signin", username, IdentityManager.SERVER_CHALLENGE, timestamp, IdentityManager.SERVER_NONCE
    ]);
    var sigHex = CryptoManager.signECC(canonical, identity.handle);
    if (!sigHex) {
      return null;
    }
    return {
      action: "signin",
      username: String(username),
      pubHex: identity.pubHex,
      curve: identity.curve,
      serverChallenge: IdentityManager.SERVER_CHALLENGE,
      timestamp: timestamp,
      serverNonce: IdentityManager.SERVER_NONCE,
      signatureHex: sigHex
    };
  },

  verifySignInRequest: function(req, storedPubHex) {
    if (!req || req.action !== "signin") {
      return false;
    }
    if (storedPubHex && req.pubHex !== storedPubHex) {
      return false;
    }
    var canonical = IdentityManager._canonical([
      "signin", req.username, req.serverChallenge, req.timestamp, req.serverNonce
    ]);
    var handle = {
      type: "EC",
      curve: req.curve || CryptoManager.DEFAULT_EC_CURVE,
      pubHex: req.pubHex
    };
    return CryptoManager.verifyECC(canonical, req.signatureHex, handle);
  },

  signIn: function(username, password) {
    CryptoManager.seedFromEnvironment(IdentityManager.SERVER_NONCE);
    var identity = IdentityManager.unlockSession(username, password);
    if (!identity) {
      return null;
    }
    var req = IdentityManager.buildSignInRequest(username, identity);
    return req ? { identity: identity, request: req } : null;
  },

  // --- Signed user input ---

  signUserInput: function(username, userText) {
    var identity = IdentityManager._sessionIdentity;
    if (!identity || identity.username !== username) {
      return null;
    }
    var canonical = IdentityManager._canonical(["input", String(userText)]);
    var sigHex = CryptoManager.signECC(canonical, identity.handle);
    if (!sigHex) {
      return null;
    }
    return {
      username: String(username),
      pubHex: identity.pubHex,
      curve: identity.curve || CryptoManager.DEFAULT_EC_CURVE,
      text: String(userText),
      signatureHex: sigHex,
      timestamp: new Date().getTime()
    };
  },

  verifySignedInput: function(packet) {
    if (!packet || !packet.pubHex) {
      return false;
    }
    var canonical = IdentityManager._canonical(["input", String(packet.text)]);
    var handle = {
      type: "EC",
      curve: packet.curve || CryptoManager.DEFAULT_EC_CURVE,
      pubHex: packet.pubHex
    };
    return CryptoManager.verifyECC(canonical, packet.signatureHex, handle);
  }
};
