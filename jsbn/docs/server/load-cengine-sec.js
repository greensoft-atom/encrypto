// Load jsbn + CEngineSec in Node.js (dev server / tests only).
// Uses the same scripts as the APK — verification matches the client exactly.

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var JSBN_DIR = path.join(__dirname, "..");

var SCRIPT_ORDER = [
  "jsbn.js",
  "jsbn2.js",
  "prng4.js",
  "rng.js",
  "sha256.js",
  "rsa.js",
  "rsa2.js",
  "ec.js",
  "sec.js",
  "ecdsa.js",
  "cengine-sec.js"
];

function loadSandbox(extraGlobals) {
  var sandbox = {
    Date: Date,
    Math: Math,
    Array: Array,
    String: String,
    parseInt: parseInt,
    JSON: JSON
  };

  if (extraGlobals) {
    var k;
    for (k in extraGlobals) {
      if (Object.prototype.hasOwnProperty.call(extraGlobals, k)) {
        sandbox[k] = extraGlobals[k];
      }
    }
  }

  vm.createContext(sandbox);

  var i;
  for (i = 0; i < SCRIPT_ORDER.length; i++) {
    var file = SCRIPT_ORDER[i];
    var code = fs.readFileSync(path.join(JSBN_DIR, file), "utf8");
    vm.runInContext(code, sandbox, { filename: file });
  }

  return sandbox;
}

function loadCEngineSec(extraGlobals) {
  return loadSandbox(extraGlobals).CEngineSec;
}

module.exports = {
  JSBN_DIR: JSBN_DIR,
  SCRIPT_ORDER: SCRIPT_ORDER,
  loadSandbox: loadSandbox,
  loadCEngineSec: loadCEngineSec
};
