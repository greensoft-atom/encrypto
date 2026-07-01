#!/usr/bin/env node
// End-to-end server verification test (no HTTP). Run: node test-server-smoke.js

var loadLib = require("./load-cengine-sec.js");

var TEST_SEED = [
  0x3a, 0xf2, 0x91, 0x0c, 0x55, 0xe8, 0x17, 0x6b,
  0x02, 0x44, 0xac, 0x81, 0xd9, 0x3f, 0x70, 0x28,
  0xce, 0x11, 0x9a, 0x64, 0x05, 0xb2, 0xf8, 0x73,
  0x1d, 0x4e, 0x86, 0xc0, 0x39, 0xa7, 0x52, 0x6d
];

var CEngineSec = loadLib.loadCEngineSec();

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL: " + msg);
    process.exit(1);
  }
}

console.log("=== Server smoke: register / signin / signed input ===");

CEngineSec.seedRandom(TEST_SEED);
var identity = CEngineSec.createUserIdentity();
assert(identity != null, "identity");

var serverNonce = "abc123nonce";
var reg = CEngineSec.buildRegisterRequest("alice", "secret123", identity, serverNonce);
assert(reg != null, "register request");
assert(CEngineSec.verifyRegisterRequest(reg), "server verify register");

var serverChallenge = "challenge99";
var signNonce = "nonce88";
CEngineSec.seedRandom(TEST_SEED);
identity = CEngineSec.createUserIdentity();
var signin = CEngineSec.buildSignInRequest("alice", identity, serverChallenge, signNonce);
assert(signin != null, "signin request");
assert(CEngineSec.verifySignInRequest(signin), "server verify signin");

CEngineSec.seedRandom(TEST_SEED);
identity = CEngineSec.createUserIdentity();
var sig = CEngineSec.signUserInput(identity.privHex, "move north");
var packet = CEngineSec.wrapSignedInput("alice", identity.pubHex, "move north", sig);
assert(CEngineSec.verifySignedInput(packet), "server verify signed input");

console.log("=== Server smoke: fixed example vectors ===");
var fixedReg = {
  action: "register",
  username: "alice",
  passwordHash: "54f1503510102b99316c1ee65f708ebe226969d72b3259e17f69db4ba7000954",
  pubHex: "04b9a3ebdde9a29ca951594d0ed3b65a831e28d3f042e5c6b9bfbcc62c9b76059ef26db481300cd672503bc05c7044f1a34f4c79e48fde350aba061b08a5b3d09b84e17ac482a9dfe03741ab3373afbee6c9dd48af99bd1a3babc823b927abea24",
  timestamp: 1700000000000,
  serverNonce: "abc123nonce",
  signatureHex: "b71d4f9482658d72941a751f020a310df1fdb21a9e20900aaa2b4e9aa10484445ba36fb95ffb34900f9531e0aa8c0faff19f51b51403f4b64aa3a69d450dfc1d141ed7160716d4d1693638cd454b729ff5ed150555eca500105928338a7faf75"
};
assert(CEngineSec.verifyRegisterRequest(fixedReg), "fixed register vector");

var fixedSignin = {
  action: "signin",
  username: "alice",
  pubHex: fixedReg.pubHex,
  serverChallenge: "challenge99",
  timestamp: 1700000000000,
  serverNonce: "nonce88",
  signatureHex: "26b0dce4afddcc47dc09cbdfd0f71e0047ecb631b6c9e908445bee1fe176891d1b3c7c9eb406dc40f4fc3d546e581232921fad7d62bfe039221920f13d7c576157467db9b49213cb75e234d26d46d7c0bb70130aa7371d55e8c570c10d3e8f7f"
};
assert(CEngineSec.verifySignInRequest(fixedSignin), "fixed signin vector");

console.log("");
console.log("All server smoke tests passed.");
