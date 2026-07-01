// CEngine2d-friendly crypto helpers for RSA-2048, ECDH/ECDSA (secp384r1), and user auth.
// Requires: jsbn.js, jsbn2.js, prng4.js, rng.js, sha256.js, rsa.js, rsa2.js, ec.js, sec.js, ecdsa.js
// No Node.js or browser globals required.

var CEngineSec = {
  RSA_BITS: 2048,
  RSA_EXP: "10001",
  ECDH_CURVE: "secp384r1",

  // Optional error callback: jsbn_onerror = function(msg) { cc.log(msg); };
  setErrorHandler: function(fn) {
    jsbn_onerror = fn;
  },

  // Seed the PRNG. Pass a byte array (0-255 per element) before key generation.
  seedRandom: function(bytes) {
    rng_reset();
    if(bytes == null || bytes.length == 0) {
      rng_seed_time();
      return;
    }
    rng_set_pool_from_bytes(bytes);
  },

  _touchEntropy: [],

  // Call from cc.eventManager touch handler to mix user input into entropy pool.
  addTouchEntropy: function(x, y) {
    var t = new Date().getTime();
    CEngineSec._touchEntropy.push(
      x & 255, (x >> 8) & 255, (x >> 16) & 255,
      y & 255, (y >> 8) & 255, (y >> 16) & 255,
      t & 255, (t >> 8) & 255, (t >> 16) & 255, (t >> 24) & 255
    );
    if(CEngineSec._touchEntropy.length > 64) {
      CEngineSec._touchEntropy = CEngineSec._touchEntropy.slice(-64);
    }
  },

  // Build a byte array from sources available in plain CEngine2d JS (no native bridge).
  gatherEntropyBytes: function(count, extraBytes) {
    var bytes = [];
    var i, j, t, r, s;

    t = new Date().getTime();
    for(i = 0; i < 4; ++i) bytes.push((t >> (i * 8)) & 255);

    if(typeof cc != "undefined") {
      if(cc.director && cc.director.getTotalFrames) {
        t = cc.director.getTotalFrames();
        bytes.push(t & 255, (t >> 8) & 255, (t >> 16) & 255, (t >> 24) & 255);
      }
      if(cc.sys) {
        s = String(cc.sys.os || "") + "|" + String(cc.sys.platform || "");
        for(j = 0; j < s.length; ++j) bytes.push(s.charCodeAt(j) & 255);
      }
    }

    while(bytes.length < count) {
      r = Math.floor(Math.random() * 4294967296);
      bytes.push(r & 255, (r >> 8) & 255, (r >> 16) & 255, (r >> 24) & 255);
    }

    if(extraBytes && extraBytes.length) {
      for(i = 0; i < extraBytes.length; ++i) bytes.push(extraBytes[i] & 255);
    }

    return bytes.slice(0, count);
  },

  // Convenience: gather JS-visible entropy and seed the PRNG in one call.
  seedFromEnvironment: function(extraBytes) {
    var mixed = CEngineSec._touchEntropy.concat(extraBytes || []);
    var bytes = CEngineSec.gatherEntropyBytes(32, mixed);
    CEngineSec.seedRandom(bytes);
    rng_seed_time();
    return bytes;
  },

  hexToBytes: function(hex) {
    var out = [];
    var i, b;
    hex = String(hex).replace(/\s+/g, "");
    if(hex.length === 0 || (hex.length % 2) !== 0) return out;
    for(i = 0; i < hex.length; i += 2) {
      b = parseInt(hex.substr(i, 2), 16);
      if(isNaN(b)) return [];
      out.push(b);
    }
    return out;
  },

  bytesToHex: function(bytes) {
    var out = "";
    var i, b;
    for(i = 0; i < bytes.length; ++i) {
      b = bytes[i] & 255;
      if(b < 16) out += "0";
      out += b.toString(16);
    }
    return out;
  },

  // --- RSA-2048 ---

  rsaGenerateKey: function() {
    var rsa = new RSAKey();
    rsa.generate(CEngineSec.RSA_BITS, CEngineSec.RSA_EXP);
    return {
      n: rsa.n.toString(16),
      e: rsa.e.toString(16),
      d: rsa.d.toString(16),
      p: rsa.p.toString(16),
      q: rsa.q.toString(16),
      dmp1: rsa.dmp1.toString(16),
      dmq1: rsa.dmq1.toString(16),
      coeff: rsa.coeff.toString(16)
    };
  },

  rsaCreatePublic: function(nHex, eHex) {
    var rsa = new RSAKey();
    if(!rsa.setPublic(nHex, eHex)) return null;
    return rsa;
  },

  rsaCreatePrivate: function(key) {
    var rsa = new RSAKey();
    if(!rsa.setPrivateEx(key.n, key.e, key.d, key.p, key.q, key.dmp1, key.dmq1, key.coeff))
      return null;
    return rsa;
  },

  rsaEncrypt: function(nHex, eHex, plaintext) {
    var rsa = CEngineSec.rsaCreatePublic(nHex, eHex);
    if(rsa == null) return null;
    return rsa.encrypt(plaintext);
  },

  rsaDecrypt: function(key, ciphertextHex) {
    var rsa = CEngineSec.rsaCreatePrivate(key);
    if(rsa == null) return null;
    return rsa.decrypt(ciphertextHex);
  },

  // --- ECDH secp384r1 ---

  _getCurveParams: function(curveName) {
    var name = curveName || CEngineSec.ECDH_CURVE;
    return getSECCurveByName(name);
  },

  _randomScalar: function(n, rng) {
    var n1 = n.subtract(BigInteger.ONE);
    var r = new BigInteger(n.bitLength(), rng);
    return r.mod(n1).add(BigInteger.ONE);
  },

  ecdhGenerateKeyPair: function(curveName) {
    var params = CEngineSec._getCurveParams(curveName);
    if(params == null) return null;
    var curve = params.getCurve();
    var G = params.getG();
    var n = params.getN();
    var rng = new SecureRandom();
    var priv = CEngineSec._randomScalar(n, rng);
    var pub = G.multiply(priv);
    return {
      privHex: priv.toString(16),
      pubHex: curve.encodePointHex(pub)
    };
  },

  ecdhComputeSecret: function(privHex, peerPubHex, curveName) {
    var params = CEngineSec._getCurveParams(curveName);
    if(params == null) return null;
    var curve = params.getCurve();
    var peer = curve.decodePointHex(peerPubHex);
    if(peer == null) return null;
    var priv = new BigInteger(privHex, 16);
    var shared = peer.multiply(priv);
    var x = shared.getX().toBigInteger().toString(16);
    var y = shared.getY().toBigInteger().toString(16);
    return {
      xHex: x,
      yHex: y,
      pointHex: curve.encodePointHex(shared)
    };
  },

  // Shared secret as raw X coordinate bytes (common for KDF input).
  ecdhSharedSecretX: function(privHex, peerPubHex, curveName) {
    var s = CEngineSec.ecdhComputeSecret(privHex, peerPubHex, curveName);
    if(s == null) return null;
    var params = CEngineSec._getCurveParams(curveName);
    var qLen = params.getCurve().getQ().toString(16).length;
    if((qLen % 2) != 0) qLen++;
    while(s.xHex.length < qLen) s.xHex = "0" + s.xHex;
    return s.xHex;
  },

  // --- SHA-256 ---

  sha256: function(text) {
    return hex_sha256(String(text));
  },

  hashPassword: function(username, password) {
    return hex_sha256(String(username) + "|" + String(password));
  },

  // --- ECDSA P-384 (sign / verify user input and auth payloads) ---

  ecdsaSign: function(privHex, message, curveName) {
    var hashHex = CEngineSec.sha256(message);
    return ecdsaSignHash(hashHex, privHex, curveName || CEngineSec.ECDH_CURVE);
  },

  ecdsaVerify: function(pubHex, message, signature, curveName) {
    var hashHex = CEngineSec.sha256(message);
    var sig = signature;
    if(typeof signature == "string") {
      sig = ecdsaSigFromHex(signature, curveName || CEngineSec.ECDH_CURVE);
    }
    if(sig == null) return false;
    return ecdsaVerifyHash(hashHex, sig, pubHex, curveName || CEngineSec.ECDH_CURVE);
  },

  // --- User identity (one key pair for ECDH + ECDSA) ---

  createUserIdentity: function(curveName) {
    var kp = CEngineSec.ecdhGenerateKeyPair(curveName);
    if(kp == null) return null;
    return {
      privHex: kp.privHex,
      pubHex: kp.pubHex,
      curve: curveName || CEngineSec.ECDH_CURVE,
      createdAt: new Date().getTime()
    };
  },

  identityToStorage: function(username, identity) {
    return {
      username: String(username),
      privHex: identity.privHex,
      pubHex: identity.pubHex,
      curve: identity.curve || CEngineSec.ECDH_CURVE,
      createdAt: identity.createdAt || new Date().getTime()
    };
  },

  saveUserLocal: function(storageKey, record) {
    if(typeof JSON === "undefined") return false;
    if(typeof cc == "undefined" || !cc.sys || !cc.sys.localStorage) return false;
    cc.sys.localStorage.setItem(storageKey, JSON.stringify(record));
    return true;
  },

  loadUserLocal: function(storageKey) {
    if(typeof JSON === "undefined") return null;
    if(typeof cc == "undefined" || !cc.sys || !cc.sys.localStorage) return null;
    var raw = cc.sys.localStorage.getItem(storageKey);
    if(raw == null || raw == "") return null;
    try {
      return JSON.parse(raw);
    } catch(e) {
      return null;
    }
  },

  _authCanonical: function(parts) {
    var i, out = "";
    for(i = 0; i < parts.length; i++) {
      if(i > 0) out += "|";
      out += String(parts[i]);
    }
    return out;
  },

  // --- Register: client sends pub key + signed payload ---

  buildRegisterRequest: function(username, password, identity, serverNonceHex) {
    if(identity == null || identity.privHex == null || identity.pubHex == null) return null;
    var passwordHash = CEngineSec.hashPassword(username, password);
    var timestamp = new Date().getTime();
    var canonical = CEngineSec._authCanonical([
      "register", username, passwordHash, identity.pubHex, timestamp, serverNonceHex
    ]);
    var sig = CEngineSec.ecdsaSign(identity.privHex, canonical);
    if(sig == null) return null;
    return {
      action: "register",
      username: String(username),
      passwordHash: passwordHash,
      pubHex: identity.pubHex,
      timestamp: timestamp,
      serverNonce: String(serverNonceHex),
      signature: sig,
      signatureHex: ecdsaSigToHex(sig)
    };
  },

  verifyRegisterRequest: function(request) {
    if(request == null || request.action != "register") return false;
    var canonical = CEngineSec._authCanonical([
      "register", request.username, request.passwordHash,
      request.pubHex, request.timestamp, request.serverNonce
    ]);
    var sig = request.signature;
    if(sig == null && request.signatureHex) {
      sig = ecdsaSigFromHex(request.signatureHex);
    }
    return CEngineSec.ecdsaVerify(request.pubHex, canonical, sig);
  },

  // --- Sign-in: prove possession of private key + server challenge ---

  buildSignInRequest: function(username, identity, serverChallengeHex, serverNonceHex) {
    if(identity == null || identity.privHex == null || identity.pubHex == null) return null;
    var timestamp = new Date().getTime();
    var canonical = CEngineSec._authCanonical([
      "signin", username, serverChallengeHex, timestamp, serverNonceHex
    ]);
    var sig = CEngineSec.ecdsaSign(identity.privHex, canonical);
    if(sig == null) return null;
    return {
      action: "signin",
      username: String(username),
      pubHex: identity.pubHex,
      serverChallenge: String(serverChallengeHex),
      timestamp: timestamp,
      serverNonce: String(serverNonceHex),
      signature: sig,
      signatureHex: ecdsaSigToHex(sig)
    };
  },

  verifySignInRequest: function(request) {
    if(request == null || request.action != "signin") return false;
    var canonical = CEngineSec._authCanonical([
      "signin", request.username, request.serverChallenge,
      request.timestamp, request.serverNonce
    ]);
    var sig = request.signature;
    if(sig == null && request.signatureHex) {
      sig = ecdsaSigFromHex(request.signatureHex);
    }
    return CEngineSec.ecdsaVerify(request.pubHex, canonical, sig);
  },

  // --- Sign / verify arbitrary user input (chat, commands, forms) ---

  signUserInput: function(privHex, userText) {
    var canonical = CEngineSec._authCanonical(["input", String(userText)]);
    return CEngineSec.ecdsaSign(privHex, canonical);
  },

  verifyUserInput: function(pubHex, userText, signature) {
    var canonical = CEngineSec._authCanonical(["input", String(userText)]);
    return CEngineSec.ecdsaVerify(pubHex, canonical, signature);
  },

  // Full signed message object for sending over network
  wrapSignedInput: function(username, pubHex, userText, signature) {
    return {
      username: String(username),
      pubHex: pubHex,
      text: String(userText),
      signature: signature,
      signatureHex: ecdsaSigToHex(signature),
      timestamp: new Date().getTime()
    };
  },

  verifySignedInput: function(packet) {
    if(packet == null || packet.pubHex == null) return false;
    var sig = packet.signature;
    if(sig == null && packet.signatureHex) {
      sig = ecdsaSigFromHex(packet.signatureHex);
    }
    return CEngineSec.verifyUserInput(packet.pubHex, packet.text, sig);
  }
};

// Backward-compatible alias (older examples used CocosSec).
var CocosSec = CEngineSec;
