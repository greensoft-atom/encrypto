#!/usr/bin/env node
// Reference auth server for jsbn / CEngineSec APK (Node.js 12+).
// Run: node server.js
// Listens on http://127.0.0.1:3000

var crypto = require("crypto");
var http = require("http");
var url = require("url");
var loadLib = require("./load-cengine-sec.js");

var PORT = process.env.PORT || 3000;
var NONCE_TTL_MS = 5 * 60 * 1000;
var CHALLENGE_TTL_MS = 5 * 60 * 1000;

var CEngineSec = loadLib.loadCEngineSec();

// --- In-memory stores (replace with DB in production) ---

var users = Object.create(null);
// users[username] = { passwordHash, pubHex, curve, createdAt }

var pendingNonces = Object.create(null);
// pendingNonces[nonceHex] = { createdAt, used }

var pendingChallenges = Object.create(null);
// pendingChallenges[username] = { challenge, nonce, createdAt, used }

var sessions = Object.create(null);
// sessions[token] = { username, createdAt }

// --- Server RSA-2048 (for optional RSA transport demo) ---

var rsaKeyPair = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" }
});

function pemToModulusExponentHex(publicPem) {
  var pub = crypto.createPublicKey(publicPem);
  var jwk = pub.export({ format: "jwk" });
  var nBuf = Buffer.from(jwk.n, "base64");
  var eBuf = Buffer.from(jwk.e, "base64");
  return {
    nHex: nBuf.toString("hex"),
    eHex: eBuf.toString("hex")
  };
}

var serverRsa = pemToModulusExponentHex(rsaKeyPair.publicKey);

function rsaDecryptPkcs1(cipherHex) {
  var cipherBuf = Buffer.from(cipherHex, "hex");
  var plain = crypto.privateDecrypt(
    {
      key: rsaKeyPair.privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING
    },
    cipherBuf
  );
  return plain.toString("utf8");
}

// --- Helpers ---

function randomHex(byteCount) {
  return crypto.randomBytes(byteCount).toString("hex");
}

function readJsonBody(req, cb) {
  var chunks = [];
  req.on("data", function(chunk) {
    chunks.push(chunk);
  });
  req.on("end", function() {
    var raw = Buffer.concat(chunks).toString("utf8");
    if (!raw) {
      cb(null, {});
      return;
    }
    try {
      cb(null, JSON.parse(raw));
    } catch (e) {
      cb(new Error("invalid JSON"));
    }
  });
  req.on("error", cb);
}

function sendJson(res, status, obj) {
  var body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function isHexLen(s, len) {
  return typeof s === "string" && s.length === len && /^[0-9a-fA-F]+$/.test(s);
}

function validatePubHex(pubHex) {
  return isHexLen(pubHex, 194) && pubHex.indexOf("04") === 0;
}

function validatePasswordHash(hash) {
  return isHexLen(hash, 64);
}

function consumeNonce(nonceHex) {
  var rec = pendingNonces[nonceHex];
  if (!rec || rec.used) return false;
  if ((Date.now() - rec.createdAt) >= NONCE_TTL_MS) return false;
  rec.used = true;
  return true;
}

function issueSession(username) {
  var token = randomHex(32);
  sessions[token] = { username: username, createdAt: Date.now() };
  return token;
}

function requireSession(req) {
  var auth = req.headers.authorization || "";
  if (auth.indexOf("Bearer ") !== 0) return null;
  var token = auth.substring(7);
  return sessions[token] || null;
}

// --- Routes ---

function handleHello(req, res) {
  var serverNonce = randomHex(32);
  pendingNonces[serverNonce] = { createdAt: Date.now(), used: false };

  sendJson(res, 200, {
    ok: true,
    serverNonce: serverNonce,
    rsaN: serverRsa.nHex,
    rsaE: serverRsa.eHex,
    curve: "secp384r1",
    note: "Call this first. Client must seed RNG with serverNonce + client entropy before keygen."
  });
}

function handleRegister(req, res) {
  readJsonBody(req, function(err, body) {
    if (err) return sendJson(res, 400, { ok: false, error: err.message });

    if (!body || body.action !== "register") {
      return sendJson(res, 400, { ok: false, error: "expected action=register" });
    }

    if (!consumeNonce(body.serverNonce)) {
      return sendJson(res, 400, { ok: false, error: "invalid or expired serverNonce" });
    }

    if (users[body.username]) {
      return sendJson(res, 409, { ok: false, error: "username already registered" });
    }

    if (!validatePasswordHash(body.passwordHash)) {
      return sendJson(res, 400, { ok: false, error: "passwordHash must be 64 hex chars (SHA-256)" });
    }

    if (!validatePubHex(body.pubHex)) {
      return sendJson(res, 400, { ok: false, error: "pubHex must be 194 hex chars starting with 04" });
    }

    if (!CEngineSec.verifyRegisterRequest(body)) {
      return sendJson(res, 401, { ok: false, error: "signature verification failed" });
    }

    users[body.username] = {
      passwordHash: body.passwordHash,
      pubHex: body.pubHex,
      curve: "secp384r1",
      createdAt: Date.now()
    };

    sendJson(res, 200, {
      ok: true,
      username: body.username,
      message: "registered — private key stays on device; server stores pubHex only"
    });
  });
}

function handleSignInStart(req, res, query) {
  var username = query.username || "";
  if (!username) {
    return sendJson(res, 400, { ok: false, error: "username query param required" });
  }

  var user = users[username];
  if (!user) {
    return sendJson(res, 404, { ok: false, error: "user not found" });
  }

  var serverNonce = randomHex(32);
  var serverChallenge = randomHex(32);

  pendingNonces[serverNonce] = { createdAt: Date.now(), used: false };
  pendingChallenges[username] = {
    challenge: serverChallenge,
    nonce: serverNonce,
    createdAt: Date.now(),
    used: false
  };

  sendJson(res, 200, {
    ok: true,
    username: username,
    serverNonce: serverNonce,
    serverChallenge: serverChallenge,
    pubHexHint: user.pubHex.substring(0, 20) + "..."
  });
}

function handleSignIn(req, res) {
  readJsonBody(req, function(err, body) {
    if (err) return sendJson(res, 400, { ok: false, error: err.message });

    if (!body || body.action !== "signin") {
      return sendJson(res, 400, { ok: false, error: "expected action=signin" });
    }

    var user = users[body.username];
    if (!user) {
      return sendJson(res, 404, { ok: false, error: "user not found" });
    }

    if (body.pubHex !== user.pubHex) {
      return sendJson(res, 401, { ok: false, error: "pubHex does not match registered key" });
    }

    if (!validatePubHex(body.pubHex)) {
      return sendJson(res, 400, { ok: false, error: "invalid pubHex format" });
    }

    var pending = pendingChallenges[body.username];
    if (!pending || pending.used) {
      return sendJson(res, 400, { ok: false, error: "no pending sign-in challenge" });
    }
    if ((Date.now() - pending.createdAt) >= CHALLENGE_TTL_MS) {
      return sendJson(res, 400, { ok: false, error: "challenge expired" });
    }
    if (body.serverChallenge !== pending.challenge) {
      return sendJson(res, 401, { ok: false, error: "wrong serverChallenge" });
    }
    if (body.serverNonce !== pending.nonce) {
      return sendJson(res, 401, { ok: false, error: "wrong serverNonce" });
    }

    if (!CEngineSec.verifySignInRequest(body)) {
      return sendJson(res, 401, { ok: false, error: "signature verification failed" });
    }

    pending.used = true;
    consumeNonce(body.serverNonce);

    var token = issueSession(body.username);
    sendJson(res, 200, {
      ok: true,
      username: body.username,
      sessionToken: token,
      expiresInSec: 3600
    });
  });
}

function handleSignedInput(req, res) {
  readJsonBody(req, function(err, body) {
    if (err) return sendJson(res, 400, { ok: false, error: err.message });

    var session = requireSession(req);
    if (!session) {
      return sendJson(res, 401, { ok: false, error: "Bearer sessionToken required" });
    }

    if (!body || !body.username || !body.text) {
      return sendJson(res, 400, { ok: false, error: "username and text required" });
    }

    if (body.username !== session.username) {
      return sendJson(res, 403, { ok: false, error: "username does not match session" });
    }

    var user = users[body.username];
    if (!user) {
      return sendJson(res, 404, { ok: false, error: "user not found" });
    }

    if (body.pubHex !== user.pubHex) {
      return sendJson(res, 401, { ok: false, error: "pubHex does not match registered key" });
    }

    if (!validatePubHex(body.pubHex)) {
      return sendJson(res, 400, { ok: false, error: "invalid pubHex format" });
    }

    if (!CEngineSec.verifySignedInput(body)) {
      return sendJson(res, 401, { ok: false, error: "signature verification failed" });
    }

    sendJson(res, 200, {
      ok: true,
      username: body.username,
      text: body.text,
      receivedAt: Date.now(),
      message: "signed input accepted"
    });
  });
}

function handleRsaDecrypt(req, res) {
  readJsonBody(req, function(err, body) {
    if (err) return sendJson(res, 400, { ok: false, error: err.message });

    if (!body || !body.loginCipher) {
      return sendJson(res, 400, { ok: false, error: "loginCipher hex required" });
    }

    try {
      var plaintext = rsaDecryptPkcs1(body.loginCipher);
      sendJson(res, 200, { ok: true, plaintext: plaintext });
    } catch (e) {
      sendJson(res, 400, { ok: false, error: "RSA decrypt failed" });
    }
  });
}

// --- HTTP server ---

var server = http.createServer(function(req, res) {
  var parsed = url.parse(req.url, true);
  var pathname = parsed.pathname;

  if (req.method === "GET" && pathname === "/api/hello") {
    return handleHello(req, res);
  }
  if (req.method === "POST" && pathname === "/api/register") {
    return handleRegister(req, res);
  }
  if (req.method === "GET" && pathname === "/api/signin/start") {
    return handleSignInStart(req, res, parsed.query);
  }
  if (req.method === "POST" && pathname === "/api/signin") {
    return handleSignIn(req, res);
  }
  if (req.method === "POST" && pathname === "/api/game/input") {
    return handleSignedInput(req, res);
  }
  if (req.method === "POST" && pathname === "/api/login/rsa-decrypt") {
    return handleRsaDecrypt(req, res);
  }

  sendJson(res, 404, { ok: false, error: "not found" });
});

server.listen(PORT, function() {
  console.log("jsbn auth server listening on http://127.0.0.1:" + PORT);
  console.log("");
  console.log("Endpoints:");
  console.log("  GET  /api/hello");
  console.log("  POST /api/register");
  console.log("  GET  /api/signin/start?username=alice");
  console.log("  POST /api/signin");
  console.log("  POST /api/game/input   (Authorization: Bearer <sessionToken>)");
  console.log("  POST /api/login/rsa-decrypt");
  console.log("");
  console.log("Server RSA public key (embed rsaN + rsaE in APK for RSA demo):");
  console.log("  rsaN = " + serverRsa.nHex.substring(0, 32) + "... (" + serverRsa.nHex.length + " hex chars)");
  console.log("  rsaE = " + serverRsa.eHex);
});
