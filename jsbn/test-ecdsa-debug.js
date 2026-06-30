var fs = require('fs'), vm = require('vm'), dir = __dirname;
var scripts = ['jsbn.js','jsbn2.js','prng4.js','rng.js','sha256.js','ec.js','sec.js','ecdsa.js'];
var S = { Date: Date, Math: Math, Array: Array, String: String, parseInt: parseInt, console: console };
vm.createContext(S);
scripts.forEach(function(f) { vm.runInContext(fs.readFileSync(dir + '/' + f, 'utf8'), S); });
S.rng_set_pool_from_bytes([0x3a,0xf2,0x91,0x0c,0x55,0xe8,0x17,0x6b,0x02,0x44,0xac,0x81,0xd9,0x3f,0x70,0x28,0xce,0x11,0x9a,0x64,0x05,0xb2,0xf8,0x73,0x1d,0x4e,0x86,0xc0,0x39,0xa7,0x52,0x6d]);

var name = 'secp384r1';
var params = S.getSECCurveByName(name);
var G = params.getG(), n = params.getN(), curve = params.getCurve();
var keylen = S.ecdsaKeyCharLen(name);
console.log('keylen', keylen);
var rng = new S.SecureRandom();
var priv = new S.BigInteger(n.bitLength(), rng).mod(n.subtract(S.BigInteger.ONE)).add(S.BigInteger.ONE);
var pubHex = curve.encodePointHex(G.multiply(priv));
console.log('pub len', pubHex.length);
var hash = S.hex_sha256('test');
var sig = S.ecdsaSignHash(hash, priv.toString(16), name);
console.log('r len', sig.rHex.length, 's len', sig.sHex.length);

try {
  var r = new S.BigInteger(sig.rHex, 16);
  var s = new S.BigInteger(sig.sHex, 16);
  var Q = curve.decodePointHex(pubHex);
  console.log('Q null?', Q == null);
  var e = new S.BigInteger(hash.substring(0, keylen), 16);
  console.log('r in range', r.compareTo(S.BigInteger.ONE) >= 0, r.compareTo(n) < 0);
  console.log('s in range', s.compareTo(S.BigInteger.ONE) >= 0, s.compareTo(n) < 0);
  var c = s.modInverse(n);
  var u1 = e.multiply(c).mod(n);
  var u2 = r.multiply(c).mod(n);
  console.log('starting multiplyTwo...');
  var t = Date.now();
  var point = G.multiplyTwo(u1, Q, u2);
  console.log('multiplyTwo ms', Date.now() - t);
  var v = point.getX().toBigInteger().mod(n);
  console.log('v==r', v.equals(r));
} catch(ex) {
  console.log('ERROR', ex);
}
