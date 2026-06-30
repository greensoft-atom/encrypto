// network-probe.js — paste into any CEngine2d view to test HTTPS (ES5).
// Does not require BizApiClient — only checks XMLHttpRequest + TLS.

var NetworkProbe = {
  run: function(url, callback) {
    callback = callback || function() {};

    if (typeof XMLHttpRequest === "undefined") {
      NetworkProbe._report({
        ok: false,
        code: "XHR_UNAVAILABLE",
        message: "XMLHttpRequest is not defined in this runtime"
      }, callback);
      return;
    }

    var testUrl = url || "https://httpbin.org/get";
    var xhr = new XMLHttpRequest();

    NetworkProbe._report({ step: "start", url: testUrl }, callback);

    xhr.open("GET", testUrl, true);
    xhr.timeout = 15000;

    xhr.onreadystatechange = function() {
      if (xhr.readyState !== 4) {
        return;
      }
      var ok = xhr.status >= 200 && xhr.status < 300;
      NetworkProbe._report({
        ok: ok,
        code: ok ? "OK" : "HTTP_ERROR",
        status: xhr.status,
        url: testUrl,
        bodyPrefix: String(xhr.responseText || "").substring(0, 120),
        message: ok ? "HTTPS request succeeded" : "HTTP status " + xhr.status
      }, callback);
    };

    xhr.onerror = function() {
      NetworkProbe._report({
        ok: false,
        code: "NETWORK_ERROR",
        status: 0,
        url: testUrl,
        message: "Network error — SSL missing, bad cert, or no connectivity"
      }, callback);
    };

    xhr.ontimeout = function() {
      NetworkProbe._report({
        ok: false,
        code: "TIMEOUT",
        status: 0,
        url: testUrl,
        message: "Request timed out"
      }, callback);
    };

    try {
      xhr.send();
    } catch (e) {
      NetworkProbe._report({
        ok: false,
        code: "SEND_FAILED",
        message: String(e.message || e)
      }, callback);
    }
  },

  _report: function(result, callback) {
    if (typeof cc !== "undefined") {
      cc.log("[NetworkProbe] " + JSON.stringify(result));
    }
    callback(result);
  }
};

// Usage in scene onEnter:
// NetworkProbe.run("https://your-api.com/api/hello", function(r) { ... });
