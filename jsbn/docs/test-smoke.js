// Comprehensive smoke tests for embedded JS (no browser / no Node at runtime).
// Run on dev PC only: node test-smoke.js
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var dir = __dirname;
var scripts = [
  'jsbn.js', 'jsbn2.js', 'prng4.js', 'rng.js', 'sha256.js',
  'rsa.js', 'rsa2.js', 'ec.js', 'sec.js', 'ecdsa.js', 'cengine-sec.js'
];

var TEST_SEED = [
  0x3a, 0xf2, 0x91, 0x0c, 0x55, 0xe8, 0x17, 0x6b,
  0x02, 0x44, 0xac, 0x81, 0xd9, 0x3f, 0x70, 0x28,
  0xce, 0x11, 0x9a, 0x64, 0x05, 0xb2, 0xf8, 0x73,
  0x1d, 0x4e, 0x86, 0xc0, 0x39, 0xa7, 0x52, 0x6d
];

function loadSandbox(extraGlobals) {
  var sandbox = {
    console: console,
    Date: Date,
    Math: Math,
    Array: Array,
    String: String,
    parseInt: parseInt,
    JSON: JSON
  };
  if(extraGlobals) {
    for(var k in extraGlobals) sandbox[k] = extraGlobals[k];
  }
  vm.createContext(sandbox);
  for(var i = 0; i < scripts.length; i++) {
    vm.runInContext(fs.readFileSync(path.join(dir, scripts[i]), 'utf8'), sandbox, {
      filename: scripts[i]
    });
  }
  return sandbox;
}

function assert(cond, msg) {
  if(!cond) {
    console.error('FAIL: ' + msg);
    process.exit(1);
  }
}

function padHex(h, len) {
  h = String(h).toLowerCase();
  while(h.length < len) h = '0' + h;
  return h;
}

console.log('=== Test 1: load in sandbox without window/navigator/alert/cc ===');
var S = loadSandbox();
assert(typeof S.CEngineSec === 'object', 'CEngineSec missing');
assert(typeof S.CocosSec === 'object', 'CocosSec alias missing');
assert(S.CocosSec === S.CEngineSec, 'CocosSec alias must point to CEngineSec');
assert(typeof S.getSECCurveByName === 'function', 'getSECCurveByName missing');
assert(S.getSECCurveByName('secp384r1') != null, 'secp384r1 curve missing');
console.log('OK');

console.log('=== Test 2: SHA-256 ===');
assert(S.sha256_vm_test(), 'sha256 self-test');
assert(S.hex_sha256('hello').length === 64, 'sha256 hex length');
console.log('OK');

console.log('=== Test 3: P-384 generator (NIST vector k=1) ===');
var params384 = S.getSECCurveByName('secp384r1');
var G384 = params384.getG();
var gx = padHex(G384.getX().toBigInteger().toString(16), 96);
var gy = padHex(G384.getY().toBigInteger().toString(16), 96);
assert(gx === 'aa87ca22be8b05378eb1c71ef320ad746e1d3b628ba79b9859f741e082542a385502f25dbf55296c3a545e3872760ab7', 'G.x mismatch');
assert(gy === '3617de4a96262c6f5d9e98bf9292dc29f8f41dbd289a147ce9da3113b5f0b8c00a60b1ce1d7e819d7a431d7c90ea0e5f', 'G.y mismatch');
console.log('OK');

console.log('=== Test 4: P-384 scalar multiply (NIST vector k=2) ===');
var P2 = G384.multiply(new S.BigInteger('2', 10));
var x2 = padHex(P2.getX().toBigInteger().toString(16), 96);
var y2 = padHex(P2.getY().toBigInteger().toString(16), 96);
assert(x2 === '08d999057ba3d2d969260045c55b97f089025959a6f434d651d207d19fb96e9e4fe0e86ebe0e64f85b96a9c75295df61', '2G.x mismatch');
assert(y2 === '8e80f1fa5b1b3cedb7bfe8dffd6dba74b275d875bc6cc43e904e505f256ab4255ffd43e94d39e22d61501e700a940e80', '2G.y mismatch');
console.log('OK');

S.CEngineSec.seedRandom(TEST_SEED);

console.log('=== Test 5: ECDH P-384 ===');
var alice = S.CEngineSec.ecdhGenerateKeyPair();
S.CEngineSec.seedRandom(TEST_SEED);
var bob = S.CEngineSec.ecdhGenerateKeyPair();
assert(alice.pubHex.length === 194, 'pubHex length must be 194');
assert(alice.pubHex.indexOf('04') === 0, 'pubHex must start with 04');
var ax = S.CEngineSec.ecdhSharedSecretX(alice.privHex, bob.pubHex);
var bx = S.CEngineSec.ecdhSharedSecretX(bob.privHex, alice.pubHex);
assert(ax === bx, 'ECDH shared secret mismatch');
console.log('OK');

console.log('=== Test 6: ECDSA sign/verify ===');
S.CEngineSec.seedRandom(TEST_SEED);
var id = S.CEngineSec.createUserIdentity();
var msg = 'input|attack at dawn';
var sig = S.CEngineSec.ecdsaSign(id.privHex, msg);
assert(sig != null && sig.rHex.length === 96 && sig.sHex.length === 96, 'sig length');
assert(S.CEngineSec.ecdsaVerify(id.pubHex, msg, sig), 'ecdsa verify failed');
assert(!S.CEngineSec.ecdsaVerify(id.pubHex, 'input|tampered', sig), 'ecdsa tamper not rejected');
var sigFromHex = S.ecdsaSigFromHex(S.ecdsaSigToHex(sig));
assert(S.CEngineSec.ecdsaVerify(id.pubHex, msg, sigFromHex), 'verify via signatureHex roundtrip');
console.log('OK');

console.log('=== Test 7: auth register/signin/signed input ===');
S.CEngineSec.seedRandom(TEST_SEED);
id = S.CEngineSec.createUserIdentity();
var reg = S.CEngineSec.buildRegisterRequest('alice', 'secret123', id, 'abc123nonce');
assert(reg != null && reg.action === 'register', 'register request');
assert(S.CEngineSec.verifyRegisterRequest(reg), 'register verify failed');
var regCopy = {
  action: reg.action,
  username: reg.username,
  passwordHash: 'deadbeef',
  pubHex: reg.pubHex,
  timestamp: reg.timestamp,
  serverNonce: reg.serverNonce,
  signatureHex: reg.signatureHex
};
assert(!S.CEngineSec.verifyRegisterRequest(regCopy), 'register tamper not rejected');
S.CEngineSec.seedRandom(TEST_SEED);
id = S.CEngineSec.createUserIdentity();
var login = S.CEngineSec.buildSignInRequest('alice', id, 'challenge99', 'nonce88');
assert(login != null && S.CEngineSec.verifySignInRequest(login), 'signin verify failed');
S.CEngineSec.seedRandom(TEST_SEED);
id = S.CEngineSec.createUserIdentity();
var packet = S.CEngineSec.wrapSignedInput('alice', id.pubHex, 'move north', S.CEngineSec.signUserInput(id.privHex, 'move north'));
assert(S.CEngineSec.verifySignedInput(packet), 'signed input verify failed');
packet.text = 'move south';
assert(!S.CEngineSec.verifySignedInput(packet), 'signed input tamper not rejected');
console.log('OK');

console.log('=== Test 8: RSA-2048 roundtrip ===');
S.CEngineSec.seedRandom(TEST_SEED);
var rsaKey = S.CEngineSec.rsaGenerateKey();
assert(rsaKey.n.length === 512, 'RSA-2048 n length');
assert(rsaKey.e === '10001', 'RSA exponent');
var pt = S.CEngineSec.rsaDecrypt(rsaKey, S.CEngineSec.rsaEncrypt(rsaKey.n, rsaKey.e, 'hello cengine2d'));
assert(pt === 'hello cengine2d', 'RSA roundtrip failed');
console.log('OK');

console.log('=== Test 9: invalid inputs return null/false (no throw) ===');
assert(S.CEngineSec.ecdhComputeSecret('00', 'bad') == null, 'bad peer pub should be null');
assert(S.CEngineSec.ecdsaVerify(id.pubHex, msg, 'aabb') === false, 'bad sig string should be false');
assert(S.CEngineSec.buildRegisterRequest('alice', 'pw', null, 'n') == null, 'null identity should be null');
assert(S.CEngineSec.hexToBytes('gg').length === 0, 'invalid hex should return empty array');
console.log('OK');

console.log('=== Test 10: deterministic keys with fixed seed ===');
S.CEngineSec.seedRandom(TEST_SEED);
var k1 = S.CEngineSec.ecdhGenerateKeyPair();
S.CEngineSec.seedRandom(TEST_SEED);
var k2 = S.CEngineSec.ecdhGenerateKeyPair();
assert(k1.privHex === k2.privHex && k1.pubHex === k2.pubHex, 'ECDH not deterministic');
console.log('OK');

console.log('');
console.log('All tests passed.');
