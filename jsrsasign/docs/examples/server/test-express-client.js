// test-express-client.js — end-to-end client against express-server.js (Node.js).
//
// Terminal 1: npm start
// Terminal 2: npm run test-client

var http = require("http");
var loadCrypto = require("./load-crypto");

var BASE = process.env.API_BASE || "http://127.0.0.1:3000";
var USER = "alice_" + String(new Date().getTime());
var PASS = "secret123";

var crypto = loadCrypto({ initServerAuth: false });
var IM = crypto.IdentityManager;
var CM = crypto.CryptoManager;

IM.init();

function request(method, path, body, token) {
  return new Promise(function(resolve, reject) {
    var url = new URL(path, BASE);
    var bodyStr = body ? JSON.stringify(body) : null;
    var headers = { Accept: "application/json" };
    if (bodyStr) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }
    if (token) {
      headers.Authorization = "Bearer " + token;
    }
    var req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: headers,
      timeout: 120000,
      agent: false
    }, function(res) {
      var chunks = [];
      res.on("data", function(c) { chunks.push(c); });
      res.on("end", function() {
        var raw = Buffer.concat(chunks).toString("utf8");
        var data = null;
        try { data = JSON.parse(raw); } catch (e) { data = raw; }
        resolve({ status: res.statusCode, data: data });
      });
    });
    req.on("error", reject);
    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

async function main() {
  console.log("=== Express E2E client ===");
  console.log("API: " + BASE);

  var hello = await request("GET", "/api/hello");
  if (!hello.data || !hello.data.serverNonce) {
    throw new Error("hello failed: " + JSON.stringify(hello));
  }
  IM.onServerHello(hello.data.serverNonce);
  console.log("hello ok");

  var reg = IM.register(USER, PASS);
  if (!reg) {
    throw new Error("local register failed");
  }
  if (String(reg.record.privEnc).indexOf("v2|") !== 0) {
    throw new Error("privEnc not v2 AES format: " + String(reg.record.privEnc).substring(0, 20));
  }
  console.log("local register ok, privEnc v2 AES");

  var regRes = await request("POST", "/api/register", reg.request);
  if (regRes.status !== 201 || !regRes.data.ok) {
    throw new Error("server register failed: " + JSON.stringify(regRes));
  }
  console.log("server register ok");

  var ph = CM.sha256(USER + "|" + PASS);
  var pwRes = await request("POST", "/api/login/password", { username: USER, passwordHash: ph });
  if (!pwRes.data.ok || !pwRes.data.challenge) {
    throw new Error("login password failed: " + JSON.stringify(pwRes));
  }
  IM.onServerHello(pwRes.data.serverNonce);
  IM.onLoginChallenge(pwRes.data.challenge);
  console.log("login password ok");

  var si = IM.signIn(USER, PASS);
  if (!si) {
    throw new Error("local signIn failed");
  }
  var siRes = await request("POST", "/api/login/signin", si.request);
  if (!siRes.data.ok || !siRes.data.sessionToken) {
    throw new Error("login signin failed: " + JSON.stringify(siRes));
  }
  console.log("login signin ok, token prefix: " + siRes.data.sessionToken.substring(0, 16));

  var pkt = IM.signUserInput(USER, "move north");
  var actRes = await request("POST", "/api/action", pkt, siRes.data.sessionToken);
  if (!actRes.data.ok) {
    throw new Error("action failed: " + JSON.stringify(actRes));
  }
  console.log("action ok: " + actRes.data.text);

  console.log("");
  console.log("Express E2E client passed.");
}

main().catch(function(err) {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});
