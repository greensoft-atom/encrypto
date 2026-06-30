// example-https-biz.js — full HTTPS + crypto auth flow (CEngine2d 1.5, ES5).
//
// Load order:
//   jsrsasign-all-min.js
//   CryptoManager.js
//   IdentityManager.js
//   NetworkManager.js
//   BizApiClient.js
//   example-https-biz.js

var BizHttpsAuth = {
  API_BASE: "https://api.example.com",

  init: function() {
    BizApiClient.init({
      baseUrl: BizHttpsAuth.API_BASE,
      timeoutMs: 30000,
      log: function(msg) { BizHttpsAuth._log(msg); }
    });

    if (!BizApiClient.isNetworkReady()) {
      BizHttpsAuth._log("WARNING: XMLHttpRequest not available — HTTPS will not work");
    }
  },

  runConnectivityProbe: function(callback) {
    BizHttpsAuth._log("probing HTTPS...");
    BizApiClient.probeHttps(function(res) {
      if (res.ok) {
        BizHttpsAuth._log("HTTPS probe OK, status=" + res.status);
      } else {
        BizHttpsAuth._log("HTTPS probe FAILED: " + res.error);
      }
      if (callback) {
        callback(res);
      }
    });
  },

  onRegisterTap: function(username, password, callback) {
    BizHttpsAuth._log("register start: " + username);

    BizApiClient.register(username, password, function(res) {
      if (!res.ok) {
        BizHttpsAuth._log("register failed: " + res.error);
        if (callback) { callback(res); }
        return;
      }
      BizHttpsAuth._log("register success, keyId=" + res.record.keyId.substring(0, 16) + "...");
      if (callback) { callback(res); }
    });
  },

  onLoginTap: function(username, password, callback) {
    BizHttpsAuth._log("login start: " + username);

    BizApiClient.login(username, password, function(res) {
      if (!res.ok) {
        BizHttpsAuth._log("login failed: " + res.error);
        if (callback) { callback(res); }
        return;
      }
      BizHttpsAuth._log("login success, token prefix=" +
        String(res.sessionToken || "").substring(0, 12) + "...");
      if (callback) { callback(res); }
    });
  },

  onSendInputTap: function(username, text, callback) {
    BizApiClient.sendAction(username, text, function(res) {
      if (!res.ok) {
        BizHttpsAuth._log("action failed: " + res.error);
        if (callback) { callback(res); }
        return;
      }
      BizHttpsAuth._log("action accepted: " + text);
      if (callback) { callback(res); }
    });
  },

  onLogoutTap: function() {
    BizApiClient.logout();
    BizHttpsAuth._log("logout done");
  },

  onTouchMoved: function(x, y) {
    CryptoManager.addTouchEntropy(x, y);
  },

  _log: function(msg) {
    if (typeof cc !== "undefined") {
      cc.log("[BizHttpsAuth] " + msg);
    }
  }
};

// --- Example: wire into a CEngine view / scene ---
//
// var LoginView = cc.Scene.extend({
//   onEnter: function() {
//     this._super();
//     BizHttpsAuth.init();
//     BizHttpsAuth.runConnectivityProbe(function(probe) {
//       if (!probe.ok) { /* show network error UI */ }
//     });
//   }
// });
//
// BizHttpsAuth.onRegisterTap("alice", "secret123");
// BizHttpsAuth.onLoginTap("alice", "secret123", function(res) {
//   if (res.ok) { goToMainBizView(); }
// });
// BizHttpsAuth.onSendInputTap("alice", "move north");
