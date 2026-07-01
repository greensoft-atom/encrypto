// express-server.js — minimal HTTPS-ready API using ServerAuth (Node.js).
//
// Setup:
//   cd jsrsasign/docs/examples/server
//   npm install
//   npm start
//
// Default: http://localhost:3000
// Client:  BizApiClient.init({ baseUrl: "http://localhost:3000" })

var express = require("express");
var loadCrypto = require("./load-crypto");

var crypto = loadCrypto();
var ServerAuth = crypto.ServerAuth;
var IdentityManager = crypto.IdentityManager;
var CryptoManager = crypto.CryptoManager;

var PORT = parseInt(process.env.PORT || "3000", 10);
var HOST = process.env.HOST || "0.0.0.0";

process.on("uncaughtException", function(err) {
  console.error("uncaughtException:", err.stack || err);
});
process.on("unhandledRejection", function(err) {
  console.error("unhandledRejection:", err.stack || err);
});

var app = express();
app.use(express.json({ limit: "256kb" }));

app.use(function(err, req, res, next) {
  console.error("Express error:", err.message || err);
  res.status(500).json({ ok: false, code: "SERVER_ERROR", error: String(err.message || err) });
});

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

function sendResult(res, result, okStatus) {
  var status = result.ok ? (okStatus || 200) : 400;
  if (result.code === "UNKNOWN_USER" || result.code === "BAD_PASSWORD") {
    status = 401;
  }
  if (result.code === "USER_EXISTS") {
    status = 409;
  }
  if (result.code === "VERIFY_FAILED" || result.code === "INVALID_SESSION" || result.code === "MISSING_SESSION") {
    status = 403;
  }
  res.status(status).json(result);
}

function bearerToken(req) {
  var h = req.headers.authorization || "";
  if (h.indexOf("Bearer ") === 0) {
    return h.substring(7);
  }
  return "";
}

// GET /api/hello
app.get("/api/hello", function(req, res) {
  res.json(ServerAuth.createHello());
});

// POST /api/register
app.post("/api/register", function(req, res) {
  try {
    sendResult(res, ServerAuth.handleRegister(req.body), 201);
  } catch (err) {
    console.error("register error:", err.stack || err);
    res.status(500).json({ ok: false, code: "SERVER_ERROR", error: String(err.message || err) });
  }
});

// POST /api/login/password
app.post("/api/login/password", function(req, res) {
  sendResult(res, ServerAuth.handleLoginPassword(req.body), 200);
});

// POST /api/login/signin
app.post("/api/login/signin", function(req, res) {
  sendResult(res, ServerAuth.handleLoginSignin(req.body), 200);
});

// POST /api/action
app.post("/api/action", function(req, res) {
  sendResult(res, ServerAuth.handleAction(req.body, bearerToken(req)), 200);
});

// GET /api/config (optional demo)
app.get("/api/config", function(req, res) {
  res.json({
    ok: true,
    serverTime: new Date().getTime(),
    cryptoVersion: CryptoManager.version(),
    serverAuthVersion: ServerAuth.version()
  });
});

// GET /health
app.get("/health", function(req, res) {
  res.json({ ok: true, service: "cengine-sec-api" });
});

app.listen(PORT, HOST, function() {
  console.log("CEngine sec API listening on http://" + HOST + ":" + PORT);
  console.log("  GET  /api/hello");
  console.log("  POST /api/register");
  console.log("  POST /api/login/password");
  console.log("  POST /api/login/signin");
  console.log("  POST /api/action  (Authorization: Bearer <token>)");
  console.log("");
  console.log("Verify helpers loaded: IdentityManager.verifyRegisterRequest, etc.");
  console.log("Password storage: PBKDF2 over client transport hash (USE_PASSWORD_KDF=" + ServerAuth.USE_PASSWORD_KDF + ")");
});
