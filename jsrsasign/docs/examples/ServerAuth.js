// ServerAuth.js — server-side verify helpers for CEngine2d auth payloads (ES5).
// Requires: jsrsasign-all-min.js, CryptoManager.js, IdentityManager.js
//
// Use the SAME IdentityManager.verify* functions as the client so canonical strings
// always match. This module adds user storage, nonces, challenges, and sessions.

var ServerAuth = {
  VERSION: "1.0.0",

  // In-memory stores (replace with your database in production)
  _users: {},
  _sessions: {},
  _activeServerNonce: "",
  _activeChallenges: {},
  _spentNonces: {},
  _spentChallenges: {},

  TIMESTAMP_SKEW_MS: 300000,

  // Server-side password storage: KDF over client transport hash (not raw password).
  USE_PASSWORD_KDF: true,

  init: function() {
    CryptoManager.initialize();
    return true;
  },

  version: function() {
    return ServerAuth.VERSION;
  },

  // --- Nonce / challenge ---

  _randomNonceHex: function(byteLen) {
    return CryptoManager.randomHex(byteLen || 32);
  },

  createHello: function() {
    CryptoManager.seedFromEnvironment();
    ServerAuth._activeServerNonce = ServerAuth._randomNonceHex(32);
    return {
      serverNonce: ServerAuth._activeServerNonce,
      serverTime: new Date().getTime()
    };
  },

  getActiveServerNonce: function() {
    return ServerAuth._activeServerNonce;
  },

  createLoginChallenge: function(username) {
    var challenge = ServerAuth._randomNonceHex(24);
    ServerAuth._activeChallenges[username] = challenge;
    return challenge;
  },

  // --- Password transport hash (must match client) ---

  passwordTransportHash: function(username, password) {
    return CryptoManager.sha256(String(username) + "|" + String(password));
  },

  _storePasswordHash: function(transportHash) {
    if (ServerAuth.USE_PASSWORD_KDF) {
      return CryptoManager.hashPassword(String(transportHash), CryptoManager.generateSalt(16), CryptoManager.PASSWORD_ITERATIONS);
    }
    return String(transportHash);
  },

  _verifyPasswordHash: function(transportHash, storedHash) {
    if (ServerAuth.USE_PASSWORD_KDF) {
      return CryptoManager.verifyPassword(String(transportHash), storedHash);
    }
    return CryptoManager.secureCompare(storedHash, String(transportHash));
  },

  // --- Register ---

  handleRegister: function(req) {
    if (!req || req.action !== "register") {
      return ServerAuth._fail("INVALID_ACTION", "Expected action=register");
    }
    if (!req.username || !req.passwordHash || !req.pubHex || !req.signatureHex) {
      return ServerAuth._fail("MISSING_FIELDS", "Register payload incomplete");
    }
    if (ServerAuth._users[req.username]) {
      return ServerAuth._fail("USER_EXISTS", "Username already registered: " + req.username);
    }
    if (ServerAuth._activeServerNonce && req.serverNonce !== ServerAuth._activeServerNonce) {
      return ServerAuth._fail("BAD_NONCE", "serverNonce does not match active hello nonce");
    }
    if (ServerAuth._spentNonces[req.serverNonce]) {
      return ServerAuth._fail("NONCE_REUSED", "serverNonce already used");
    }
    if (!ServerAuth._checkTimestamp(req.timestamp)) {
      return ServerAuth._fail("TIMESTAMP_SKEW", "timestamp outside allowed window");
    }

    var canonical = ServerAuth._canonical([
      "register", req.username, req.passwordHash, req.pubHex, req.timestamp, req.serverNonce
    ]);

    if (!IdentityManager.verifyRegisterRequest(req)) {
      return ServerAuth._fail("VERIFY_FAILED", "Register signature invalid", {
        canonical: canonical
      });
    }

    ServerAuth._spentNonces[req.serverNonce] = true;
    ServerAuth._users[req.username] = {
      username: req.username,
      passwordHash: ServerAuth._storePasswordHash(req.passwordHash),
      pubHex: req.pubHex,
      curve: req.curve || CryptoManager.DEFAULT_EC_CURVE,
      keyId: CryptoManager.sha384(req.pubHex),
      createdAt: new Date().getTime()
    };

    return ServerAuth._ok("REGISTER_OK", {
      username: req.username,
      keyId: ServerAuth._users[req.username].keyId,
      canonical: canonical
    });
  },

  // --- Login step 1: password ---

  handleLoginPassword: function(body) {
    if (!body || !body.username || !body.passwordHash) {
      return ServerAuth._fail("MISSING_FIELDS", "Expected username and passwordHash");
    }

    var user = ServerAuth._users[body.username];
    if (!user) {
      return ServerAuth._fail("UNKNOWN_USER", "No such user: " + body.username);
    }
    if (!ServerAuth._verifyPasswordHash(String(body.passwordHash), user.passwordHash)) {
      return ServerAuth._fail("BAD_PASSWORD", "passwordHash mismatch");
    }

    var challenge = ServerAuth.createLoginChallenge(body.username);
    var serverNonce = ServerAuth._randomNonceHex(32);
    ServerAuth._activeServerNonce = serverNonce;

    return ServerAuth._ok("LOGIN_PASSWORD_OK", {
      challenge: challenge,
      serverChallenge: challenge,
      serverNonce: serverNonce
    });
  },

  // --- Login step 2: signed sign-in ---

  handleLoginSignin: function(req) {
    if (!req || req.action !== "signin") {
      return ServerAuth._fail("INVALID_ACTION", "Expected action=signin");
    }

    var user = ServerAuth._users[req.username];
    if (!user) {
      return ServerAuth._fail("UNKNOWN_USER", "No such user: " + req.username);
    }

    var expectedChallenge = ServerAuth._activeChallenges[req.username];
    var challenge = req.serverChallenge || req.challenge || "";
    if (!expectedChallenge || challenge !== expectedChallenge) {
      return ServerAuth._fail("BAD_CHALLENGE", "serverChallenge mismatch or expired");
    }
    if (ServerAuth._spentChallenges[challenge]) {
      return ServerAuth._fail("CHALLENGE_REUSED", "challenge already used");
    }
    if (req.serverNonce && ServerAuth._spentNonces[req.serverNonce]) {
      return ServerAuth._fail("NONCE_REUSED", "serverNonce already used");
    }
    if (!ServerAuth._checkTimestamp(req.timestamp)) {
      return ServerAuth._fail("TIMESTAMP_SKEW", "timestamp outside allowed window");
    }

    var canonical = ServerAuth._canonical([
      "signin", req.username, req.serverChallenge, req.timestamp, req.serverNonce
    ]);

    if (!IdentityManager.verifySignInRequest(req, user.pubHex)) {
      return ServerAuth._fail("VERIFY_FAILED", "Sign-in signature invalid", {
        canonical: canonical
      });
    }

    ServerAuth._spentChallenges[challenge] = true;
    if (req.serverNonce) {
      ServerAuth._spentNonces[req.serverNonce] = true;
    }
    delete ServerAuth._activeChallenges[req.username];

    var sessionToken = ServerAuth._createSessionToken(req.username);

    return ServerAuth._ok("LOGIN_SIGNIN_OK", {
      username: req.username,
      sessionToken: sessionToken,
      canonical: canonical
    });
  },

  // --- Signed user action ---

  handleAction: function(packet, sessionToken) {
    if (!packet || !packet.username || !packet.text || !packet.signatureHex) {
      return ServerAuth._fail("MISSING_FIELDS", "Action packet incomplete");
    }

    var user = ServerAuth._users[packet.username];
    if (!user) {
      return ServerAuth._fail("UNKNOWN_USER", "No such user: " + packet.username);
    }
    if (packet.pubHex !== user.pubHex) {
      return ServerAuth._fail("PUBKEY_MISMATCH", "pubHex does not match registered key");
    }
    if (sessionToken && !ServerAuth._validateSession(sessionToken, packet.username)) {
      return ServerAuth._fail("INVALID_SESSION", "Bearer token invalid or wrong user");
    }
    if (!sessionToken) {
      return ServerAuth._fail("MISSING_SESSION", "Authorization Bearer token required");
    }
    if (!ServerAuth._checkTimestamp(packet.timestamp)) {
      return ServerAuth._fail("TIMESTAMP_SKEW", "timestamp outside allowed window");
    }

    var canonical = ServerAuth._canonical(["input", String(packet.text)]);

    if (!IdentityManager.verifySignedInput(packet)) {
      return ServerAuth._fail("VERIFY_FAILED", "Action signature invalid", {
        canonical: canonical
      });
    }

    return ServerAuth._ok("ACTION_OK", {
      username: packet.username,
      text: packet.text,
      canonical: canonical
    });
  },

  // --- Session helpers ---

  _createSessionToken: function(username) {
    var token = CryptoManager.sha256(
      username + "|" + String(new Date().getTime()) + "|" + ServerAuth._randomNonceHex(16)
    );
    ServerAuth._sessions[token] = {
      username: username,
      createdAt: new Date().getTime()
    };
    return token;
  },

  _validateSession: function(token, username) {
    var sess = ServerAuth._sessions[token];
    return sess && sess.username === username;
  },

  getUser: function(username) {
    return ServerAuth._users[username] || null;
  },

  reset: function() {
    ServerAuth._users = {};
    ServerAuth._sessions = {};
    ServerAuth._activeServerNonce = "";
    ServerAuth._activeChallenges = {};
    ServerAuth._spentNonces = {};
    ServerAuth._spentChallenges = {};
  },

  // --- Internal ---

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

  _checkTimestamp: function(ts) {
    if (!ts) {
      return true;
    }
    var now = new Date().getTime();
    var diff = now - ts;
    if (diff < 0) {
      diff = -diff;
    }
    return diff <= ServerAuth.TIMESTAMP_SKEW_MS;
  },

  _ok: function(code, data) {
    var out = { ok: true, code: code };
    if (data) {
      var k;
      for (k in data) {
        if (data.hasOwnProperty(k)) {
          out[k] = data[k];
        }
      }
    }
    return out;
  },

  _fail: function(code, error, extra) {
    var out = { ok: false, code: code, error: error };
    if (extra) {
      var k;
      for (k in extra) {
        if (extra.hasOwnProperty(k)) {
          out[k] = extra[k];
        }
      }
    }
    return out;
  }
};
