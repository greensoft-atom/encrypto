// CryptoManager.js — jsrsasign facade for Cocos2d-JS 1.5 (ES5, no require).
// Requires: jsrsasign-all-min.js loaded first.
//
// Game code should use CryptoManager only — never KEYUTIL / KJUR directly.

var CryptoManager = {
  VERSION: "1.0.0",
  DEFAULT_EC_CURVE: "secp384r1",
  DEFAULT_EC_SIGN_ALG: "SHA384withECDSA",
  DEFAULT_RSA_BITS: 2048,
  DEFAULT_RSA_SIGN_ALG: "SHA256withRSA",
  PASSWORD_ITERATIONS: 10000,

  _initialized: false,
  _touchEntropy: [],

  initialize: function() {
    if (typeof KEYUTIL === "undefined" || typeof KJUR === "undefined") {
      throw "CryptoManager: load jsrsasign-all-min.js before CryptoManager.js";
    }
    CryptoManager._initialized = true;
    return true;
  },

  _ensureInit: function() {
    if (!CryptoManager._initialized) {
      CryptoManager.initialize();
    }
  },

  version: function() {
    return CryptoManager.VERSION;
  },

  // --- Random / entropy ---

  randomHex: function(byteCount) {
    CryptoManager._ensureInit();
    return KJUR.crypto.Util.getRandomHexOfNbytes(byteCount);
  },

  randomBytes: function(byteCount) {
    return CryptoManager.hexDecode(CryptoManager.randomHex(byteCount));
  },

  addTouchEntropy: function(x, y) {
    var t = new Date().getTime();
    CryptoManager._touchEntropy.push(
      x & 255, (x >> 8) & 255, (x >> 16) & 255,
      y & 255, (y >> 8) & 255, (y >> 16) & 255,
      t & 255, (t >> 8) & 255, (t >> 16) & 255, (t >> 24) & 255
    );
    if (CryptoManager._touchEntropy.length > 64) {
      CryptoManager._touchEntropy = CryptoManager._touchEntropy.slice(-64);
    }
  },

  gatherEntropyBytes: function(count, extraBytes) {
    var bytes = [];
    var i, j, t, r, s;

    t = new Date().getTime();
    for (i = 0; i < 4; ++i) {
      bytes.push((t >> (i * 8)) & 255);
    }

    if (typeof cc !== "undefined") {
      if (cc.director && cc.director.getTotalFrames) {
        t = cc.director.getTotalFrames();
        bytes.push(t & 255, (t >> 8) & 255, (t >> 16) & 255, (t >> 24) & 255);
      }
      if (cc.sys) {
        s = String(cc.sys.os || "") + "|" + String(cc.sys.platform || "");
        for (j = 0; j < s.length; ++j) {
          bytes.push(s.charCodeAt(j) & 255);
        }
      }
    }

    while (bytes.length < count) {
      r = Math.floor(Math.random() * 4294967296);
      bytes.push(r & 255, (r >> 8) & 255, (r >> 16) & 255, (r >> 24) & 255);
    }

    if (extraBytes && extraBytes.length) {
      for (i = 0; i < extraBytes.length; ++i) {
        bytes.push(extraBytes[i] & 255);
      }
    }

    return bytes.slice(0, count);
  },

  seedFromEnvironment: function(extraHex) {
    CryptoManager._ensureInit();
    var extra = [];
    if (extraHex) {
      if (typeof extraHex === "string") {
        extra = CryptoManager.hexDecode(extraHex);
      } else if (extraHex.length) {
        extra = extraHex;
      }
    }
    var mixed = CryptoManager._touchEntropy.concat(extra);
    var bytes = CryptoManager.gatherEntropyBytes(32, mixed);

    // Mix gathered entropy into jsrsasign's global PRNG pool (rng.js).
    // Must run before the first getRandomHexOfNbytes / key-generation call.
    if (typeof rng_seed_int === "function") {
      var i, v;
      for (i = 0; i < bytes.length; i += 4) {
        v = bytes[i] || 0;
        if (i + 1 < bytes.length) { v |= (bytes[i + 1] << 8); }
        if (i + 2 < bytes.length) { v |= (bytes[i + 2] << 16); }
        if (i + 3 < bytes.length) { v |= (bytes[i + 3] << 24); }
        rng_seed_int(v >>> 0);
      }
      if (typeof rng_seed_time === "function") {
        rng_seed_time();
      }
    }

    CryptoManager._lastSeedHex = CryptoManager.bytesToHex(bytes);
    return bytes;
  },

  // --- Hash ---

  _digest: function(alg, text) {
    CryptoManager._ensureInit();
    var md = new KJUR.crypto.MessageDigest({ alg: alg });
    return md.digestString(String(text));
  },

  sha256: function(text) {
    return CryptoManager._digest("sha256", text);
  },

  sha384: function(text) {
    return CryptoManager._digest("sha384", text);
  },

  sha512: function(text) {
    return CryptoManager._digest("sha512", text);
  },

  hmacSHA256: function(keyText, message) {
    CryptoManager._ensureInit();
    var mac = new KJUR.crypto.Mac({ alg: "HmacSHA256", pass: keyText });
    return mac.doFinalString(message);
  },

  // --- Encoding ---

  hexDecode: function(hex) {
    var out = [];
    var i;
    hex = String(hex).replace(/\s+/g, "");
    for (i = 0; i < hex.length; i += 2) {
      out.push(parseInt(hex.substr(i, 2), 16));
    }
    return out;
  },

  bytesToHex: function(bytes) {
    var out = "";
    var i, b;
    for (i = 0; i < bytes.length; ++i) {
      b = bytes[i] & 255;
      if (b < 16) {
        out += "0";
      }
      out += b.toString(16);
    }
    return out;
  },

  hexEncode: function(bytes) {
    return CryptoManager.bytesToHex(bytes);
  },

  base64Encode: function(str) {
    CryptoManager._ensureInit();
    return utf8tob64(String(str));
  },

  base64Decode: function(b64) {
    CryptoManager._ensureInit();
    return b64toutf8(String(b64));
  },

  secureCompare: function(a, b) {
    a = String(a);
    b = String(b);
    if (a.length !== b.length) {
      return false;
    }
    var i, diff = 0;
    for (i = 0; i < a.length; ++i) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  },

  // --- Key handles ---

  _wrapRSAKeyPair: function(kp, bits) {
    return {
      type: "RSA",
      bits: bits || CryptoManager.DEFAULT_RSA_BITS,
      private: true,
      privHex: null,
      pubHex: null,
      _prv: kp.prvKeyObj,
      _pub: kp.pubKeyObj
    };
  },

  _wrapECKeyPair: function(kp, curve) {
    return {
      type: "EC",
      curve: curve || CryptoManager.DEFAULT_EC_CURVE,
      private: true,
      privHex: kp.prvKeyObj.prvKeyHex,
      pubHex: kp.pubKeyObj.pubKeyHex,
      _prv: kp.prvKeyObj,
      _pub: kp.pubKeyObj
    };
  },

  _wrapPublicKey: function(keyObj) {
    if (keyObj.isPrivate) {
      return null;
    }
    if (keyObj.pubKeyHex !== undefined) {
      return {
        type: "EC",
        curve: keyObj.curveName || CryptoManager.DEFAULT_EC_CURVE,
        private: false,
        privHex: null,
        pubHex: keyObj.pubKeyHex,
        _prv: null,
        _pub: keyObj
      };
    }
    return {
      type: "RSA",
      bits: keyObj.n ? keyObj.n.bitLength() : CryptoManager.DEFAULT_RSA_BITS,
      private: false,
      privHex: null,
      pubHex: null,
      _prv: null,
      _pub: keyObj
    };
  },

  _wrapPrivateKey: function(keyObj) {
    if (!keyObj.isPrivate) {
      return null;
    }
    if (keyObj.prvKeyHex !== undefined) {
      return {
        type: "EC",
        curve: keyObj.curveName || CryptoManager.DEFAULT_EC_CURVE,
        private: true,
        privHex: keyObj.prvKeyHex,
        pubHex: keyObj.pubKeyHex || null,
        _prv: keyObj,
        _pub: null
      };
    }
    return {
      type: "RSA",
      bits: keyObj.n ? keyObj.n.bitLength() : CryptoManager.DEFAULT_RSA_BITS,
      private: true,
      privHex: null,
      pubHex: null,
      _prv: keyObj,
      _pub: null
    };
  },

  generateRSA: function(bits) {
    CryptoManager._ensureInit();
    var keyBits = bits || CryptoManager.DEFAULT_RSA_BITS;
    var kp = KEYUTIL.generateKeypair("RSA", keyBits);
    return CryptoManager._wrapRSAKeyPair(kp, keyBits);
  },

  generateECC: function(curve) {
    CryptoManager._ensureInit();
    var curveName = curve || CryptoManager.DEFAULT_EC_CURVE;
    var kp = KEYUTIL.generateKeypair("EC", curveName);
    return CryptoManager._wrapECKeyPair(kp, curveName);
  },

  loadPrivateKey: function(pem, pass) {
    CryptoManager._ensureInit();
    var keyObj = pass ? KEYUTIL.getKey(pem, pass) : KEYUTIL.getKey(pem);
    return CryptoManager._wrapPrivateKey(keyObj);
  },

  loadPublicKey: function(pem) {
    CryptoManager._ensureInit();
    var keyObj = KEYUTIL.getKey(pem);
    return CryptoManager._wrapPublicKey(keyObj);
  },

  exportPrivatePEM: function(handle, format) {
    CryptoManager._ensureInit();
    if (!handle || !handle._prv) {
      return null;
    }
    var fmt = format || (handle.type === "RSA" ? "PKCS8PRV" : "PKCS8PRV");
    return KEYUTIL.getPEM(handle._prv, fmt);
  },

  exportPublicPEM: function(handle, format) {
    CryptoManager._ensureInit();
    var pub = handle._pub;
    if (!pub && handle._prv && handle._prv.isPublic) {
      pub = handle._prv;
    }
    if (!pub) {
      return null;
    }
    var fmt = format || "PKCS8PUB";
    return KEYUTIL.getPEM(pub, fmt);
  },

  importPEM: function(pem, pass) {
    CryptoManager._ensureInit();
    var keyObj = pass ? KEYUTIL.getKey(pem, pass) : KEYUTIL.getKey(pem);
    if (keyObj.isPrivate) {
      return CryptoManager._wrapPrivateKey(keyObj);
    }
    return CryptoManager._wrapPublicKey(keyObj);
  },

  publicKeyFingerprint: function(handle) {
    var pem = CryptoManager.exportPublicPEM(handle);
    if (!pem && handle.pubHex) {
      return CryptoManager.sha384(handle.pubHex);
    }
    if (!pem) {
      return null;
    }
    return CryptoManager.sha384(pem);
  },

  // --- RSA sign / verify ---

  signRSA: function(message, handle, alg) {
    CryptoManager._ensureInit();
    var sigAlg = alg || CryptoManager.DEFAULT_RSA_SIGN_ALG;
    var prv = handle._prv;
    if (!prv) {
      return null;
    }
    var sig = new KJUR.crypto.Signature({ alg: sigAlg });
    sig.init(prv);
    sig.updateString(String(message));
    return sig.sign();
  },

  verifyRSA: function(message, sigHex, handle, alg) {
    CryptoManager._ensureInit();
    var sigAlg = alg || CryptoManager.DEFAULT_RSA_SIGN_ALG;
    var pub = handle._pub;
    if (!pub && handle._prv && handle._prv.isPublic) {
      pub = handle._prv;
    }
    if (!pub) {
      return false;
    }
    var sig = new KJUR.crypto.Signature({ alg: sigAlg });
    sig.init(pub);
    sig.updateString(String(message));
    return sig.verify(String(sigHex).replace(/\s+/g, ""));
  },

  // --- ECC sign / verify ---

  signECC: function(message, handle, alg) {
    CryptoManager._ensureInit();
    var sigAlg = alg || CryptoManager.DEFAULT_EC_SIGN_ALG;
    var curve = handle.curve || CryptoManager.DEFAULT_EC_CURVE;
    var sig = new KJUR.crypto.Signature({ alg: sigAlg });
    if (handle._prv) {
      sig.init(handle._prv);
    } else if (handle.privHex) {
      sig.init({ d: handle.privHex, curve: curve });
    } else {
      return null;
    }
    sig.updateString(String(message));
    return sig.sign();
  },

  verifyECC: function(message, sigHex, handle, alg) {
    CryptoManager._ensureInit();
    var sigAlg = alg || CryptoManager.DEFAULT_EC_SIGN_ALG;
    var curve = handle.curve || CryptoManager.DEFAULT_EC_CURVE;
    var sig = new KJUR.crypto.Signature({ alg: sigAlg });
    if (handle._pub) {
      sig.init(handle._pub);
    } else if (handle.pubHex) {
      sig.init({ xy: handle.pubHex, curve: curve });
    } else {
      return false;
    }
    sig.updateString(String(message));
    return sig.verify(String(sigHex).replace(/\s+/g, ""));
  },

  // --- Password hashing (upgrade-friendly stub) ---

  generateSalt: function(byteLen) {
    return CryptoManager.randomHex(byteLen || 16);
  },

  hashPassword: function(password, salt, iterations) {
    var iters = iterations || CryptoManager.PASSWORD_ITERATIONS;
    var s = salt || CryptoManager.generateSalt(16);
    var out = String(s) + String(password);
    var i;
    for (i = 0; i < iters; ++i) {
      out = CryptoManager.sha256(out);
    }
    return String(s) + ":" + String(iters) + ":" + out;
  },

  verifyPassword: function(password, storedHash) {
    if (!storedHash || storedHash.indexOf(":") < 0) {
      return false;
    }
    var parts = storedHash.split(":");
    var salt, iters, expected;
    // Format: salt:iterations:hash  (salt must be hex — no colons)
    if (parts.length >= 3 && /^\d+$/.test(parts[1])) {
      salt = parts[0];
      iters = parseInt(parts[1], 10);
      expected = parts.slice(2).join(":");
    } else {
      salt = parts[0];
      iters = CryptoManager.PASSWORD_ITERATIONS;
      expected = parts.slice(1).join(":");
    }
    var actual = CryptoManager.hashPassword(password, salt, iters);
    var actualParts = actual.split(":");
    var actualBody = (actualParts.length >= 3 && /^\d+$/.test(actualParts[1]))
      ? actualParts.slice(2).join(":")
      : actualParts.slice(1).join(":");
    return CryptoManager.secureCompare(expected, actualBody);
  },

  // --- Convenience: sign/verify by algorithm name ---

  sign: function(message, handle, profile) {
    if (!profile) {
      profile = handle.type === "EC" ? CryptoManager.DEFAULT_EC_SIGN_ALG : CryptoManager.DEFAULT_RSA_SIGN_ALG;
    }
    if (typeof profile === "object") {
      if (profile.type === "EC") {
        return CryptoManager.signECC(message, handle, profile.sign);
      }
      return CryptoManager.signRSA(message, handle, profile.sign);
    }
    if (profile.indexOf("ECDSA") >= 0) {
      return CryptoManager.signECC(message, handle, profile);
    }
    return CryptoManager.signRSA(message, handle, profile);
  },

  verify: function(message, sigHex, handle, profile) {
    if (!profile) {
      profile = handle.type === "EC" ? CryptoManager.DEFAULT_EC_SIGN_ALG : CryptoManager.DEFAULT_RSA_SIGN_ALG;
    }
    if (typeof profile === "object") {
      if (profile.type === "EC") {
        return CryptoManager.verifyECC(message, sigHex, handle, profile.sign);
      }
      return CryptoManager.verifyRSA(message, sigHex, handle, profile.sign);
    }
    if (profile.indexOf("ECDSA") >= 0) {
      return CryptoManager.verifyECC(message, sigHex, handle, profile);
    }
    return CryptoManager.verifyRSA(message, sigHex, handle, profile);
  }
};
