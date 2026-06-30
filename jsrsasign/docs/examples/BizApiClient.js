// BizApiClient.js — HTTPS biz API wired to IdentityManager (ES5).
// Requires: CryptoManager.js, IdentityManager.js, NetworkManager.js
//
// Typical server routes (adjust ENDPOINTS to match your backend):
//   GET  /api/hello              -> { serverNonce, serverTime }
//   POST /api/register           -> register payload (signed)
//   POST /api/login/password     -> { username, passwordHash } -> { challenge, serverNonce }
//   POST /api/login/signin       -> signin payload (signed) -> { sessionToken }
//   POST /api/action             -> signed user input packet
//   GET  /api/config             -> signed biz config (optional)

var BizApiClient = {
  ENDPOINTS: {
    hello: "/api/hello",
    register: "/api/register",
    loginPassword: "/api/login/password",
    loginSignin: "/api/login/signin",
    action: "/api/action",
    config: "/api/config"
  },

  _logFn: null,

  init: function(config) {
    config = config || {};
    IdentityManager.init();
    NetworkManager.initialize({
      baseUrl: config.baseUrl || "https://api.example.com",
      timeoutMs: config.timeoutMs || 30000,
      headers: config.headers || null
    });
    if (config.endpoints) {
      var k;
      for (k in config.endpoints) {
        if (config.endpoints.hasOwnProperty(k)) {
          BizApiClient.ENDPOINTS[k] = config.endpoints[k];
        }
      }
    }
    BizApiClient._logFn = config.log || BizApiClient._defaultLog;
    return true;
  },

  _defaultLog: function(msg) {
    if (typeof cc !== "undefined") {
      cc.log("[BizApi] " + msg);
    }
  },

  _log: function(msg) {
    if (BizApiClient._logFn) {
      BizApiClient._logFn(msg);
    }
  },

  isNetworkReady: function() {
    return NetworkManager.isAvailable();
  },

  probeHttps: function(callback) {
    if (!NetworkManager.isAvailable()) {
      callback({
        ok: false,
        error: "XMLHttpRequest not available",
        code: "XHR_UNAVAILABLE"
      });
      return;
    }
    NetworkManager.probe(NetworkManager.buildUrl(BizApiClient.ENDPOINTS.hello), callback);
  },

  fetchHello: function(callback) {
    NetworkManager.get(BizApiClient.ENDPOINTS.hello, function(res) {
      if (!res.ok || !res.data || !res.data.serverNonce) {
        callback({
          ok: false,
          error: res.error || "Invalid hello response (missing serverNonce)",
          code: res.code || "HELLO_FAILED",
          raw: res
        });
        return;
      }
      IdentityManager.onServerHello(res.data.serverNonce);
      BizApiClient._log("hello ok, nonce prefix: " + String(res.data.serverNonce).substring(0, 16));
      callback({
        ok: true,
        serverNonce: res.data.serverNonce,
        serverTime: res.data.serverTime || null,
        data: res.data
      });
    });
  },

  register: function(username, password, callback) {
    BizApiClient.fetchHello(function(helloRes) {
      if (!helloRes.ok) {
        callback(helloRes);
        return;
      }

      var result = IdentityManager.register(username, password);
      if (!result) {
        callback({
          ok: false,
          error: "Local register/keygen failed",
          code: "REGISTER_LOCAL_FAILED"
        });
        return;
      }

      NetworkManager.post(BizApiClient.ENDPOINTS.register, result.request, function(res) {
        if (!res.ok) {
          callback({
            ok: false,
            error: res.error || "Register rejected by server",
            code: res.code || "REGISTER_FAILED",
            raw: res
          });
          return;
        }

        BizApiClient._log("register accepted for " + username);
        callback({
          ok: true,
          username: username,
          record: result.record,
          server: res.data
        });
      });
    });
  },

  login: function(username, password, callback) {
    BizApiClient.fetchHello(function(helloRes) {
      if (!helloRes.ok) {
        callback(helloRes);
        return;
      }

      var passwordHash = CryptoManager.sha256(String(username) + "|" + String(password));

      NetworkManager.post(BizApiClient.ENDPOINTS.loginPassword, {
        username: String(username),
        passwordHash: passwordHash
      }, function(pwRes) {
        if (!pwRes.ok || !pwRes.data) {
          callback({
            ok: false,
            error: pwRes.error || "Password login step failed",
            code: pwRes.code || "LOGIN_PASSWORD_FAILED",
            raw: pwRes
          });
          return;
        }

        if (pwRes.data.serverNonce) {
          IdentityManager.onServerHello(pwRes.data.serverNonce);
        }
        IdentityManager.onLoginChallenge(pwRes.data.challenge || pwRes.data.serverChallenge || "");

        var signInResult = IdentityManager.signIn(username, password);
        if (!signInResult) {
          callback({
            ok: false,
            error: "Local sign-in failed (no identity or bad password)",
            code: "LOGIN_LOCAL_FAILED"
          });
          return;
        }

        NetworkManager.post(BizApiClient.ENDPOINTS.loginSignin, signInResult.request, function(siRes) {
          if (!siRes.ok) {
            callback({
              ok: false,
              error: siRes.error || "Sign-in rejected by server",
              code: siRes.code || "LOGIN_SIGNIN_FAILED",
              raw: siRes
            });
            return;
          }

          if (siRes.data && siRes.data.sessionToken) {
            NetworkManager.setSessionToken(siRes.data.sessionToken);
          }

          BizApiClient._log("login ok for " + username);
          callback({
            ok: true,
            username: username,
            sessionToken: siRes.data ? siRes.data.sessionToken : null,
            server: siRes.data
          });
        });
      });
    });
  },

  sendAction: function(username, text, callback) {
    var packet = IdentityManager.signUserInput(username, text);
    if (!packet) {
      callback({
        ok: false,
        error: "Not signed in — call login() first",
        code: "NO_SESSION"
      });
      return;
    }

    NetworkManager.post(BizApiClient.ENDPOINTS.action, packet, function(res) {
      if (!res.ok) {
        callback({
          ok: false,
          error: res.error || "Action rejected",
          code: res.code || "ACTION_FAILED",
          raw: res
        });
        return;
      }
      callback({
        ok: true,
        packet: packet,
        server: res.data
      });
    });
  },

  fetchConfig: function(callback) {
    NetworkManager.get(BizApiClient.ENDPOINTS.config, function(res) {
      if (!res.ok) {
        callback({
          ok: false,
          error: res.error || "Config fetch failed",
          code: res.code || "CONFIG_FAILED",
          raw: res
        });
        return;
      }
      callback({
        ok: true,
        config: res.data
      });
    });
  },

  logout: function() {
    IdentityManager.clearSession();
    NetworkManager.clearSessionToken();
    BizApiClient._log("logged out");
  }
};
