// Smoke tests for ServerAuth (Node.js).
// Run: node jsrsasign/docs/examples/test-server-smoke.js

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var examplesDir = __dirname;
var jsrsasignPath = path.join(examplesDir, "..", "..", "jsrsasign-all-min.js");

function loadSandbox() {
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
          getItem: function(k) { return store[k] || null; }
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
  return sandbox;
}

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL: " + msg);
    process.exit(1);
  }
}

var S = loadSandbox();
var CM = S.CryptoManager;
var IM = S.IdentityManager;
var Server = S.ServerAuth;

Server.reset();
Server.init();
IM.init();

console.log("=== Test 1: hello ===");
var hello = Server.createHello();
assert(hello.serverNonce && hello.serverNonce.length === 64, "serverNonce 64 hex");
console.log("OK");

console.log("=== Test 2: full register + login + action ===");
IM.onServerHello(hello.serverNonce);
var reg = IM.register("bob", "pass456");
assert(reg && reg.request, "client register");
var regRes = Server.handleRegister(reg.request);
assert(regRes.ok, "server register: " + (regRes.error || regRes.code));

var ph = CM.sha256("bob|pass456");
var pwRes = Server.handleLoginPassword({ username: "bob", passwordHash: ph });
assert(pwRes.ok, "login password");

IM.onServerHello(pwRes.serverNonce);
IM.onLoginChallenge(pwRes.challenge);
var si = IM.signIn("bob", "pass456");
assert(si && si.request, "client signin");
var siRes = Server.handleLoginSignin(si.request);
assert(siRes.ok && siRes.sessionToken, "server signin");

var pkt = IM.signUserInput("bob", "hello server");
assert(pkt, "client action");
var actRes = Server.handleAction(pkt, siRes.sessionToken);
assert(actRes.ok, "server action");
console.log("OK");

console.log("=== Test 3: reject duplicate register ===");
var dup = Server.handleRegister(reg.request);
assert(!dup.ok && dup.code === "USER_EXISTS", "duplicate user");
console.log("OK");

console.log("=== Test 4: reject bad password ===");
var badPw = Server.handleLoginPassword({ username: "bob", passwordHash: "00" });
assert(!badPw.ok, "bad password");
console.log("OK");

console.log("=== Test 5: reject tampered action ===");
pkt.text = "tampered";
assert(!Server.handleAction(pkt, siRes.sessionToken).ok, "tampered action");
console.log("OK");

console.log("=== Test 6: reject action without session token ===");
pkt.text = "hello server";
assert(!Server.handleAction(pkt, "").ok, "missing token");
console.log("OK");

console.log("");
console.log("All ServerAuth tests passed.");
