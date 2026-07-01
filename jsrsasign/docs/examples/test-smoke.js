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
assert(String(regResult.record.privEnc).indexOf("v2|") === 0, "privEnc v2 AES format");
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
var b64 = CM.base64Encode("cengine-sec");
assert(CM.base64Decode(b64) === "cengine-sec", "base64 roundtrip");
console.log("OK");

console.log("=== Test 11: wrong password rejected ===");
IM.clearSession();
var loginBad = IM.signIn("alice", "wrong-password");
assert(loginBad === null, "wrong password signIn returns null");
assert(IM._sessionIdentity === null, "no session after wrong password");
console.log("OK");

console.log("=== Test 12: SHA384withECDSA default alg ===");
CM.seedFromEnvironment("feedface");
var ec2 = CM.generateECC("secp384r1");
var m384 = "sha384-canonical-test";
var sig384 = CM.signECC(m384, ec2);
assert(sig384 && sig384.substr(0, 2) === "30", "default ec sig der");
assert(CM.verifyECC(m384, sig384, { type: "EC", pubHex: ec2.pubHex, curve: "secp384r1" }), "pubHex-only verify");
console.log("OK");

console.log("=== Test 13: bootstrap shim (no pre-set navigator) ===");
var S2 = (function() {
  var store2 = {};
  var sb = {
    console: console, Date: Date, Math: Math, Array: Array, String: String,
    parseInt: parseInt, JSON: JSON,
    cc: { sys: { localStorage: { setItem: function(k,v){store2[k]=v;}, getItem: function(k){return store2[k]||null;} } } }
  };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(examplesDir, "cengine-bootstrap.js"), "utf8"), sb);
  vm.runInContext(fs.readFileSync(jsrsasignPath, "utf8"), sb);
  assert(typeof sb.navigator !== "undefined", "bootstrap created navigator");
  assert(typeof sb.KEYUTIL !== "undefined", "jsrsasign loaded after bootstrap");
  return sb;
})();
console.log("OK");

console.log("=== Test 14: register without server hello blocked ===");
IM.SERVER_NONCE = "";
var idNoNonce = IM.createIdentity();
var reqNoNonce = IM.buildRegisterRequest("bob", "pw", idNoNonce);
assert(reqNoNonce === null, "register request blocked without serverNonce");
console.log("OK");

console.log("=== Test 15: AES privEnc roundtrip ===");
var privSample = CM.randomHex(48);
var enc = CM.encryptPrivateHex(privSample, "user|pass");
var dec = CM.decryptPrivateHex(enc, "user|pass");
assert(dec === privSample, "AES privEnc roundtrip");
assert(CM.decryptPrivateHex(enc, "user|wrong") === null, "wrong passphrase fails");
console.log("OK");

console.log("");
console.log("All tests passed.");
