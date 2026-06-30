// NetworkManager.js — HTTPS client for CEngine2d 1.5 via XMLHttpRequest (ES5).
// No Android Java code required — TLS is handled by the CEngine2d runtime.
//
// Requires: XMLHttpRequest (built into most CEngine2d Android builds).

var NetworkManager = {
  VERSION: "1.0.0",

  DEFAULT_TIMEOUT_MS: 30000,

  _config: {
    baseUrl: "",
    timeoutMs: 30000,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  },

  _sessionToken: "",

  initialize: function(config) {
    config = config || {};
    if (config.baseUrl) {
      NetworkManager._config.baseUrl = String(config.baseUrl).replace(/\/+$/, "");
    }
    if (config.timeoutMs) {
      NetworkManager._config.timeoutMs = config.timeoutMs;
    }
    if (config.headers) {
      var k;
      for (k in config.headers) {
        if (config.headers.hasOwnProperty(k)) {
          NetworkManager._config.headers[k] = config.headers[k];
        }
      }
    }
    return true;
  },

  isAvailable: function() {
    return typeof XMLHttpRequest !== "undefined";
  },

  setSessionToken: function(token) {
    NetworkManager._sessionToken = token ? String(token) : "";
  },

  getSessionToken: function() {
    return NetworkManager._sessionToken;
  },

  clearSessionToken: function() {
    NetworkManager._sessionToken = "";
  },

  buildUrl: function(path) {
    path = String(path || "");
    if (path.indexOf("http://") === 0 || path.indexOf("https://") === 0) {
      return path;
    }
    if (path.charAt(0) !== "/") {
      path = "/" + path;
    }
    return NetworkManager._config.baseUrl + path;
  },

  // --- Core request ---

  request: function(method, path, options, callback) {
    if (!NetworkManager.isAvailable()) {
      callback({
        ok: false,
        status: 0,
        data: null,
        error: "XMLHttpRequest not available in this runtime",
        code: "XHR_UNAVAILABLE"
      });
      return;
    }

    options = options || {};
    callback = callback || function() {};

    var url = NetworkManager.buildUrl(path);
    var xhr = new XMLHttpRequest();
    var timeoutMs = options.timeoutMs || NetworkManager._config.timeoutMs || NetworkManager.DEFAULT_TIMEOUT_MS;
    var body = options.body;
    var bodyStr = null;
    var headers = {};
    var headerName;
    var timerId = null;
    var finished = false;

    for (headerName in NetworkManager._config.headers) {
      if (NetworkManager._config.headers.hasOwnProperty(headerName)) {
        headers[headerName] = NetworkManager._config.headers[headerName];
      }
    }
    if (options.headers) {
      for (headerName in options.headers) {
        if (options.headers.hasOwnProperty(headerName)) {
          headers[headerName] = options.headers[headerName];
        }
      }
    }
    if (NetworkManager._sessionToken) {
      headers["Authorization"] = "Bearer " + NetworkManager._sessionToken;
    }

    if (body !== undefined && body !== null) {
      if (typeof body === "string") {
        bodyStr = body;
      } else {
        bodyStr = JSON.stringify(body);
      }
    }

    function done(result) {
      if (finished) {
        return;
      }
      finished = true;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      callback(result);
    }

    function parseResponseText(text) {
      if (text === null || text === undefined || text === "") {
        return null;
      }
      try {
        return JSON.parse(String(text));
      } catch (e) {
        return text;
      }
    }

    xhr.open(String(method || "GET").toUpperCase(), url, true);

    for (headerName in headers) {
      if (headers.hasOwnProperty(headerName)) {
        xhr.setRequestHeader(headerName, headers[headerName]);
      }
    }

    if (typeof xhr.timeout === "number") {
      xhr.timeout = timeoutMs;
    } else {
      timerId = setTimeout(function() {
        try {
          xhr.abort();
        } catch (abortErr) {}
        done({
          ok: false,
          status: 0,
          data: null,
          error: "Request timed out after " + timeoutMs + " ms",
          code: "TIMEOUT",
          url: url
        });
      }, timeoutMs);
    }

    xhr.onreadystatechange = function() {
      if (xhr.readyState !== 4) {
        return;
      }
      var status = xhr.status;
      var responseText = xhr.responseText;
      var data = parseResponseText(responseText);
      var ok = status >= 200 && status < 300;

      done({
        ok: ok,
        status: status,
        data: data,
        raw: responseText,
        error: ok ? null : (NetworkManager._errorMessage(status, data, responseText)),
        code: ok ? "OK" : NetworkManager._statusCode(status),
        url: url
      });
    };

    xhr.onerror = function() {
      done({
        ok: false,
        status: 0,
        data: null,
        error: "Network error (check HTTPS URL, certificate, or connectivity)",
        code: "NETWORK_ERROR",
        url: url
      });
    };

    if (typeof xhr.ontimeout === "object" || typeof xhr.ontimeout === "function" || xhr.ontimeout === null) {
      xhr.ontimeout = function() {
        done({
          ok: false,
          status: 0,
          data: null,
          error: "Request timed out",
          code: "TIMEOUT",
          url: url
        });
      };
    }

    try {
      xhr.send(bodyStr);
    } catch (sendErr) {
      done({
        ok: false,
        status: 0,
        data: null,
        error: String(sendErr.message || sendErr),
        code: "SEND_FAILED",
        url: url
      });
    }
  },

  _statusCode: function(status) {
    if (status === 0) {
      return "NETWORK_ERROR";
    }
    if (status === 401) {
      return "UNAUTHORIZED";
    }
    if (status === 403) {
      return "FORBIDDEN";
    }
    if (status === 404) {
      return "NOT_FOUND";
    }
    if (status >= 500) {
      return "SERVER_ERROR";
    }
    return "HTTP_ERROR";
  },

  _errorMessage: function(status, data, raw) {
    if (data && typeof data === "object") {
      if (data.error) {
        return String(data.error);
      }
      if (data.message) {
        return String(data.message);
      }
    }
    if (raw && String(raw).length < 200) {
      return "HTTP " + status + ": " + raw;
    }
    return "HTTP " + status;
  },

  // --- Convenience methods ---

  get: function(path, callback, options) {
    NetworkManager.request("GET", path, options || {}, callback);
  },

  post: function(path, body, callback, options) {
    var opts = options || {};
    opts.body = body;
    NetworkManager.request("POST", path, opts, callback);
  },

  put: function(path, body, callback, options) {
    var opts = options || {};
    opts.body = body;
    NetworkManager.request("PUT", path, opts, callback);
  },

  del: function(path, callback, options) {
    NetworkManager.request("DELETE", path, options || {}, callback);
  },

  // --- Connectivity probe ---

  probe: function(url, callback) {
    var probeUrl = url || NetworkManager.buildUrl("/api/hello");
    NetworkManager.get(probeUrl, function(res) {
      callback({
        ok: res.ok,
        status: res.status,
        data: res.data,
        error: res.error,
        code: res.code,
        xhrAvailable: NetworkManager.isAvailable(),
        url: probeUrl
      });
    }, { timeoutMs: 15000 });
  }
};
