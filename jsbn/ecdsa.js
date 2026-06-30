// ECDSA sign/verify for Fp curves (secp384r1). Requires ec.js, sec.js, jsbn.js, jsbn2.js, rng.js.

function ecdsaKeyCharLen(curveName) {
  var params = getSECCurveByName(curveName || "secp384r1");
  if(params == null) return 0;
  var qlen = params.getCurve().getQ().toString(16).length;
  if((qlen % 2) != 0) qlen++;
  return qlen;
}

function ecdsaPadHex(h, len) {
  h = String(h);
  while(h.length < len) h = "0" + h;
  return h;
}

function ecdsaRandomScalar(n, rng) {
  var n1 = n.subtract(BigInteger.ONE);
  var r = new BigInteger(n.bitLength(), rng);
  return r.mod(n1).add(BigInteger.ONE);
}

function ecdsaSignHash(hashHex, privHex, curveName) {
  var name = curveName || "secp384r1";
  var params = getSECCurveByName(name);
  if(params == null) return null;

  var keylen = ecdsaKeyCharLen(name);
  var n = params.getN();
  var G = params.getG();
  var d = new BigInteger(privHex, 16);
  var e = new BigInteger(String(hashHex).substring(0, keylen), 16);
  var rng = new SecureRandom();
  var r, s, k, Q;

  do {
    k = ecdsaRandomScalar(n, rng);
    Q = G.multiply(k);
    r = Q.getX().toBigInteger().mod(n);
  } while(r.compareTo(BigInteger.ZERO) <= 0);

  s = k.modInverse(n).multiply(e.add(d.multiply(r))).mod(n);

  return {
    rHex: ecdsaPadHex(r.toString(16), keylen),
    sHex: ecdsaPadHex(s.toString(16), keylen)
  };
}

function ecdsaVerifyHash(hashHex, sig, pubHex, curveName) {
  var name = curveName || "secp384r1";
  var params = getSECCurveByName(name);
  if(params == null || sig == null) return false;

  try {
    var keylen = ecdsaKeyCharLen(name);
    var n = params.getN();
    var G = params.getG();
    var curve = params.getCurve();
    var r = new BigInteger(sig.rHex, 16);
    var s = new BigInteger(sig.sHex, 16);
    var Q = curve.decodePointHex(pubHex);
    var e = new BigInteger(String(hashHex).substring(0, keylen), 16);

    if(Q == null) return false;
    if(r.compareTo(BigInteger.ONE) < 0 || r.compareTo(n) >= 0) return false;
    if(s.compareTo(BigInteger.ONE) < 0 || s.compareTo(n) >= 0) return false;

    var c = s.modInverse(n);
    var u1 = e.multiply(c).mod(n);
    var u2 = r.multiply(c).mod(n);
    var point = G.multiplyTwo(u1, Q, u2);
    var v = point.getX().toBigInteger().mod(n);
    return v.equals(r);
  } catch(ex) {
    return false;
  }
}

function ecdsaSigToHex(sig) {
  return sig.rHex + sig.sHex;
}

function ecdsaSigFromHex(hex, curveName) {
  var keylen = ecdsaKeyCharLen(curveName || "secp384r1");
  hex = String(hex).replace(/\s+/g, "");
  if(hex.length != keylen * 2) return null;
  return {
    rHex: hex.substring(0, keylen),
    sHex: hex.substring(keylen)
  };
}
