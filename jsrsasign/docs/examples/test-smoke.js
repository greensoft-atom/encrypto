// Smoke tests for CryptoManager + IdentityManager (Node.js).
// Run from repo root: node jsrsasign/docs/examples/test-smoke.js

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
    navigator: { appName: "Netscape" },
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
  vm.runInContext(fs.readFileSync(jsrsasignPath, "utf8"), sandbox, { filename: "jsrsasign-all-min.js" });
  vm.runInContext(fs.readFileSync(path.join(examplesDir, "CryptoManager.js"), "utf8"), sandbox, { filename: "CryptoManager.js" });
  vm.runInContext(fs.readFileSync(path.join(examplesDir, "IdentityManager.js"), "utf8"), sandbox, { filename: "IdentityManager.js" });
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

console.log("=== Test 1: initialize ===");
CM.initialize();
assert(CM.version() === "1.0.0", "version");
console.log("OK");

console.log("=== Test 2: SHA-256 known vector ===");
assert(
  CM.sha256("aaa") === "9834876dcfb05cb167a5c24953eba58c4ac89b1adf57f28f2f9d09af107ee8f0",
  "sha256(aaa)"
);
console.log("OK");

console.log("=== Test 3: EC P-384 keygen + sign/verify ===");
CM.seedFromEnvironment("deadbeef0123456789abcdef0123456789abcdef0123456789abcdef01234567");
var ec = CM.generateECC("secp384r1");
assert(ec && ec.pubHex.indexOf("04") === 0, "ec pub starts with 04");
var msg = "player action|move north";
var sig = CM.signECC(msg, ec);
assert(sig && sig.substr(0, 2) === "30", "ecdsa der sig");
assert(CM.verifyECC(msg, sig, ec), "ecdsa verify");
assert(!CM.verifyECC("tampered", sig, ec), "ecdsa reject tamper");
console.log("OK — sig prefix: " + sig.substring(0, 20));

console.log("=== Test 4: RSA-2048 sign/verify ===");
CM.seedFromEnvironment("cafebabe");
var rsa = CM.generateRSA(2048);
assert(rsa && rsa.type === "RSA", "rsa key");
var rsaMsg = "config manifest v1";
var rsaSig = CM.signRSA(rsaMsg, rsa);
assert(rsaSig, "rsa sign");
var pubOnly = { type: "RSA", _pub: rsa._pub, private: false };
assert(CM.verifyRSA(rsaMsg, rsaSig, pubOnly), "rsa verify");
console.log("OK");

console.log("=== Test 5: PEM export/import ===");
var pem = CM.exportPublicPEM(ec);
assert(pem.indexOf("BEGIN PUBLIC KEY") >= 0, "public pem");
var loaded = CM.loadPublicKey(pem);
assert(CM.verifyECC(msg, sig, loaded), "verify with loaded pem key");
console.log("OK");

console.log("=== Test 6: password hash ===");
var stored = CM.hashPassword("secret", "salt1234", 100);
assert(CM.verifyPassword("secret", stored), "password verify ok");
assert(!CM.verifyPassword("wrong", stored), "password reject wrong");
console.log("OK");

console.log("=== Test 7: register flow ===");
IM.init();
IM.onServerHello("servernonce00112233445566778899aabbccddeeff");
var regResult = IM.register("alice", "password123");
assert(regResult && regResult.request.action === "register", "register request");
assert(regResult.record.privEnc, "privEnc stored");
assert(!regResult.record.privHex, "no plaintext privHex when password given");
assert(IM.verifyRegisterRequest(regResult.request), "register verify");
var badReg = regResult.request;
badReg.passwordHash = "0000000000000000000000000000000000000000000000000000000000000000";
assert(!IM.verifyRegisterRequest(badReg), "register tamper rejected");
console.log("OK — pubHex prefix: " + regResult.request.pubHex.substring(0, 20));

assert(!IM.signUserInput("alice", "before login"), "sign input blocked without session");

console.log("=== Test 8: sign-in flow (unlocks session) ===");
IM.onLoginChallenge("challenge99887766");
var loginResult = IM.signIn("alice", "password123");
assert(loginResult && loginResult.request.action === "signin", "signin request");
assert(IM._sessionIdentity != null, "session unlocked");
assert(
  IM.verifySignInRequest(loginResult.request, regResult.record.pubHex),
  "signin verify"
);
console.log("OK");

console.log("=== Test 9: signed user input (requires session) ===");
var packet = IM.signUserInput("alice", "attack at dawn");
assert(packet && packet.signatureHex, "signed packet");
assert(IM.verifySignedInput(packet), "input verify");
packet.text = "retreat";
assert(!IM.verifySignedInput(packet), "input tamper rejected");
console.log("OK");

console.log("=== Test 10: RNG seeding + base64 roundtrip ===");
CM.seedFromEnvironment("00112233445566778899aabbccddeeff");
var r1 = CM.randomHex(16);
CM.seedFromEnvironment("00112233445566778899aabbccddeeff");
var r2 = CM.randomHex(16);
assert(typeof r1 === "string" && r1.length === 32, "random hex length");
var b64 = CM.base64Encode("cocos2d-sec");
assert(CM.base64Decode(b64) === "cocos2d-sec", "base64 roundtrip");
console.log("OK");

console.log("");
console.log("All tests passed.");
