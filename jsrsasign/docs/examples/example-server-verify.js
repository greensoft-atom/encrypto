// example-server-verify.js — step-by-step client + server verify walkthrough (Node.js).
//
// Run from repo root:
//   node jsrsasign/docs/examples/example-server-verify.js
//
// Simulates:
//   GET  /api/hello
//   POST /api/register
//   POST /api/login/password
//   POST /api/login/signin
//   POST /api/action
//
// Uses the same canonical strings and verify functions on both sides.

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var examplesDir = __dirname;
var jsrsasignPath = path.join(examplesDir, "..", "..", "jsrsasign-all-min.js");

function loadCryptoSandbox() {
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

function log(step, msg) {
  console.log("");
  console.log("--- Step " + step + ": " + msg + " ---");
}

function show(label, obj) {
  console.log(label + ":");
  console.log(JSON.stringify(obj, null, 2));
}

function trunc(s, n) {
  s = String(s || "");
  if (s.length <= n) {
    return s;
  }
  return s.substring(0, n) + "... (" + s.length + " chars)";
}

// =============================================================================
// Load crypto modules (client + server share verify logic via IdentityManager)
// =============================================================================

var S = loadCryptoSandbox();
var CM = S.CryptoManager;
var IM = S.IdentityManager;
var Server = S.ServerAuth;

var USERNAME = "alice";
var PASSWORD = "secret123";

Server.reset();
Server.init();
IM.init();

console.log("============================================================");
console.log("  Server-side verify walkthrough");
console.log("  User: " + USERNAME + "  Password: " + PASSWORD);
console.log("============================================================");

// =============================================================================
// Step 1 — Server hello
// =============================================================================

log(1, "Server creates hello (GET /api/hello)");

var hello = Server.createHello();
show("Server response", hello);

// Client receives nonce and seeds RNG
IM.onServerHello(hello.serverNonce);
console.log("Client: IdentityManager.onServerHello(\"" + trunc(hello.serverNonce, 32) + "\")");

// =============================================================================
// Step 2 — Client register
// =============================================================================

log(2, "Client registers (builds signed payload)");

var passwordHash = CM.sha256(USERNAME + "|" + PASSWORD);
console.log("passwordHash = SHA256(\"" + USERNAME + "|" + PASSWORD + "\")");
console.log("             = " + passwordHash);

var regResult = IM.register(USERNAME, PASSWORD);
if (!regResult) {
  console.error("Client register failed");
  process.exit(1);
}

var regReq = regResult.request;
console.log("Canonical string signed by client:");
console.log("  " + IM._canonical([
  "register", regReq.username, regReq.passwordHash, regReq.pubHex,
  regReq.timestamp, regReq.serverNonce
]));
console.log("pubHex prefix: " + trunc(regReq.pubHex, 40));
console.log("signatureHex prefix: " + trunc(regReq.signatureHex, 40));

// =============================================================================
// Step 3 — Server verifies register
// =============================================================================

log(3, "Server verifies register (POST /api/register)");

show("Request body", {
  action: regReq.action,
  username: regReq.username,
  passwordHash: regReq.passwordHash,
  pubHex: trunc(regReq.pubHex, 40),
  curve: regReq.curve,
  timestamp: regReq.timestamp,
  serverNonce: trunc(regReq.serverNonce, 32),
  signatureHex: trunc(regReq.signatureHex, 40)
});

var regRes = Server.handleRegister(regReq);
show("Server result", regRes);

if (!regRes.ok) {
  console.error("Register verification FAILED");
  process.exit(1);
}

console.log("Server stored user:");
show("DB row", Server.getUser(USERNAME));

// =============================================================================
// Step 4 — Tamper test (register signature)
// =============================================================================

log(4, "Server rejects tampered register signature");

var tamperedReg = JSON.parse(JSON.stringify(regReq));
tamperedReg.passwordHash = "0000000000000000000000000000000000000000000000000000000000000000";
var tamperedVerify = IM.verifyRegisterRequest(tamperedReg);
console.log("IdentityManager.verifyRegisterRequest(tampered) => " + tamperedVerify);
if (tamperedVerify) {
  console.error("Should have rejected tampered register signature");
  process.exit(1);
}

// =============================================================================
// Step 5 — Login password step
// =============================================================================

log(5, "Client login password step (POST /api/login/password)");

var loginPwBody = {
  username: USERNAME,
  passwordHash: passwordHash
};
show("Request body", loginPwBody);

var pwRes = Server.handleLoginPassword(loginPwBody);
show("Server response", {
  challenge: pwRes.challenge,
  serverNonce: trunc(pwRes.serverNonce, 32),
  code: pwRes.code,
  ok: pwRes.ok
});

if (!pwRes.ok) {
  console.error("Login password step FAILED");
  process.exit(1);
}

IM.onServerHello(pwRes.serverNonce);
IM.onLoginChallenge(pwRes.challenge);
console.log("Client: onServerHello(\"" + trunc(pwRes.serverNonce, 32) + "\")  // fresh nonce for sign-in");
console.log("Client: onLoginChallenge(\"" + pwRes.challenge + "\")");

// =============================================================================
// Step 6 — Wrong password on client (no session)
// =============================================================================

log(6, "Client wrong password returns null");

var badSignIn = IM.signIn(USERNAME, "wrong-password");
console.log("signIn(\"" + USERNAME + "\", \"wrong-password\") => " + (badSignIn ? "request" : "null"));
if (badSignIn) {
  console.error("Wrong password should return null");
  process.exit(1);
}

// =============================================================================
// Step 7 — Client sign-in (correct password)
// =============================================================================

log(7, "Client builds sign-in request (signs with private key)");

var signInResult = IM.signIn(USERNAME, PASSWORD);
if (!signInResult) {
  console.error("Client signIn failed");
  process.exit(1);
}

var signInReq = signInResult.request;
console.log("Canonical string signed by client:");
console.log("  " + IM._canonical([
  "signin", signInReq.username, signInReq.serverChallenge,
  signInReq.timestamp, signInReq.serverNonce
]));
console.log("signatureHex prefix: " + trunc(signInReq.signatureHex, 40));

// =============================================================================
// Step 8 — Server verifies sign-in
// =============================================================================

log(8, "Server verifies sign-in (POST /api/login/signin)");

var signInRes = Server.handleLoginSignin(signInReq);
show("Server result", {
  ok: signInRes.ok,
  code: signInRes.code,
  username: signInRes.username,
  sessionToken: trunc(signInRes.sessionToken, 32),
  canonical: signInRes.canonical
});

if (!signInRes.ok) {
  console.error("Sign-in verification FAILED");
  process.exit(1);
}

var sessionToken = signInRes.sessionToken;

// =============================================================================
// Step 9 — Client signed action
// =============================================================================

log(9, "Client signs user action");

var actionText = "move north";
var packet = IM.signUserInput(USERNAME, actionText);
if (!packet) {
  console.error("signUserInput failed");
  process.exit(1);
}

console.log("Canonical string signed by client:");
console.log("  input|" + actionText);
show("Action packet", {
  username: packet.username,
  text: packet.text,
  curve: packet.curve,
  pubHex: trunc(packet.pubHex, 40),
  signatureHex: trunc(packet.signatureHex, 40),
  timestamp: packet.timestamp
});

// =============================================================================
// Step 10 — Server verifies action
// =============================================================================

log(10, "Server verifies action (POST /api/action)");

console.log("Authorization: Bearer " + trunc(sessionToken, 32));

var actionRes = Server.handleAction(packet, sessionToken);
show("Server result", actionRes);

if (!actionRes.ok) {
  console.error("Action verification FAILED");
  process.exit(1);
}

// =============================================================================
// Step 11 — Tamper action text
// =============================================================================

log(11, "Server rejects tampered action");

var tamperedPacket = JSON.parse(JSON.stringify(packet));
tamperedPacket.text = "move south";
var tamperedActionRes = Server.handleAction(tamperedPacket, sessionToken);
console.log("Tampered action ok=" + tamperedActionRes.ok + " code=" + tamperedActionRes.code);

// =============================================================================
// Done
// =============================================================================

console.log("");
console.log("============================================================");
console.log("  All server verification steps passed.");
console.log("============================================================");
console.log("");
console.log("Summary:");
console.log("  Register canonical: register|username|passwordHash|pubHex|timestamp|serverNonce");
console.log("  Sign-in canonical:  signin|username|serverChallenge|timestamp|serverNonce");
console.log("  Action canonical:   input|userText");
console.log("");
console.log("Server APIs (ServerAuth.js):");
console.log("  ServerAuth.createHello()");
console.log("  ServerAuth.handleRegister(req)");
console.log("  ServerAuth.handleLoginPassword({ username, passwordHash })");
console.log("  ServerAuth.handleLoginSignin(req)");
console.log("  ServerAuth.handleAction(packet, sessionToken)");
