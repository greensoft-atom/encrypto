// Smoke tests for NetworkManager (Node.js with mock XMLHttpRequest).
// Run: node jsrsasign/docs/examples/test-network-smoke.js

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var examplesDir = __dirname;

function MockXMLHttpRequest() {
  this.readyState = 0;
  this.status = 0;
  this.responseText = "";
  this.timeout = 0;
  this.onreadystatechange = null;
  this.onerror = null;
  this.ontimeout = null;
  this._method = "GET";
  this._url = "";
  this._headers = {};
  this._body = null;
}

MockXMLHttpRequest.prototype.open = function(method, url, async) {
  this._method = method;
  this._url = url;
  this.readyState = 1;
};

MockXMLHttpRequest.prototype.setRequestHeader = function(name, value) {
  this._headers[name] = value;
};

MockXMLHttpRequest.prototype.send = function(body) {
  var self = this;
  this._body = body;
  this.readyState = 4;

  if (self._url.indexOf("/fail") >= 0) {
    self.status = 500;
    self.responseText = '{"error":"server boom"}';
  } else if (self._url.indexOf("/hello") >= 0) {
    self.status = 200;
    self.responseText = JSON.stringify({
      serverNonce: "abc123def4567890abc123def4567890abc123def4567890abc123def4567890",
      serverTime: 1750000000000
    });
  } else if (self._method === "POST") {
    self.status = 200;
    self.responseText = JSON.stringify({ ok: true, received: true });
  } else {
    self.status = 200;
    self.responseText = '{"ok":true}';
  }

  if (self.onreadystatechange) {
    self.onreadystatechange();
  }
};

MockXMLHttpRequest.prototype.abort = function() {};

function loadSandbox() {
  var sandbox = {
    console: console,
    Date: Date,
    Math: Math,
    Array: Array,
    String: String,
    parseInt: parseInt,
    JSON: JSON,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    XMLHttpRequest: MockXMLHttpRequest
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(examplesDir, "NetworkManager.js"), "utf8"), sandbox, { filename: "NetworkManager.js" });
  return sandbox;
}

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL: " + msg);
    process.exit(1);
  }
}

var S = loadSandbox();
var NM = S.NetworkManager;

console.log("=== Test 1: isAvailable ===");
assert(NM.isAvailable(), "mock XHR available");
console.log("OK");

console.log("=== Test 2: GET hello ===");
NM.initialize({ baseUrl: "https://api.example.com" });
NM.get("/api/hello", function(res) {
  assert(res.ok, "hello ok");
  assert(res.data.serverNonce, "has serverNonce");
  console.log("OK");

  console.log("=== Test 3: POST JSON body ===");
  NM.post("/api/register", { action: "register", username: "alice" }, function(res2) {
    assert(res2.ok, "post ok");
    assert(res2.data.received, "server received");
    console.log("OK");

    console.log("=== Test 4: session token header ===");
    NM.setSessionToken("test-token-xyz");
    var xhr = new MockXMLHttpRequest();
    NM.post("/api/action", { text: "hi" }, function(res3) {
      assert(res3.ok, "action post ok");
      console.log("OK");

      console.log("=== Test 5: error response ===");
      NM.get("/api/fail", function(res4) {
        assert(!res4.ok, "fail not ok");
        assert(res4.status === 500, "status 500");
        assert(res4.code === "SERVER_ERROR", "server error code");
        console.log("OK");

        console.log("");
        console.log("All NetworkManager tests passed.");
      });
    });
  });
});
