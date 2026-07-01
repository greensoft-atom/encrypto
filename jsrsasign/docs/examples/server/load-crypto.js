// load-crypto.js — load jsrsasign + facades into a sandbox (Node.js).
// Used by express-server.js and server-side scripts.

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var examplesDir = path.join(__dirname, "..");
var jsrsasignPath = path.join(examplesDir, "..", "..", "jsrsasign-all-min.js");

function loadCrypto(options) {
  options = options || {};
  var store = {};
  var sandbox = {
    console: console,
    Date: Date,
    Math: Math,
    Array: Array,
    String: String,
    parseInt: parseInt,
    JSON: JSON,
    cc: {
      sys: {
        localStorage: {
          setItem: function(k, v) { store[k] = v; },
          getItem: function(k) { return store[k] || null; },
          removeItem: function(k) { delete store[k]; }
        }
      }
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(examplesDir, "cengine-bootstrap.js"), "utf8"), sandbox, { filename: "cengine-bootstrap.js" });
  vm.runInContext(fs.readFileSync(jsrsasignPath, "utf8"), sandbox, { filename: "jsrsasign-all-min.js" });
  vm.runInContext(fs.readFileSync(path.join(examplesDir, "CryptoManager.js"), "utf8"), sandbox, { filename: "CryptoManager.js" });
  vm.runInContext(fs.readFileSync(path.join(examplesDir, "IdentityManager.js"), "utf8"), sandbox, { filename: "IdentityManager.js" });
  vm.runInContext(fs.readFileSync(path.join(examplesDir, "ServerAuth.js"), "utf8"), sandbox, { filename: "ServerAuth.js" });

  sandbox.CryptoManager.initialize();
  if (options.initServerAuth !== false) {
    sandbox.ServerAuth.init();
  }

  sandbox._localStorageStore = store;
  return sandbox;
}

module.exports = loadCrypto;
