// Comprehensive smoke tests — run: node test-smoke.js
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var dir = __dirname;
var scripts = [
  'jsbn.js', 'jsbn2.js', 'prng4.js', 'rng.js', 'sha256.js',
  'rsa.js', 'rsa2.js', 'ec.js', 'sec.js', 'ecdsa.js', 'cocos2d-sec.js'
];

var TEST_SEED = [
  0x3a, 0xf2, 0x91, 0x0c, 0x55, 0xe8, 0x17, 0x6b,
  0x02, 0x44, 0xac, 0x81, 0xd9, 0x3f, 0x70, 0x28,
  0xce, 0x11, 0x9a, 0x64, 0x05, 0xb2, 0xf8, 0x73,
  0x1d, 0x4e, 0x86, 0xc0, 0x39, 0xa7, 0x52, 0x6d
];

function loadSandbox() {
  var sandbox = { console: console, Date: Date, Math: Math, Array: Array, String: String, parseInt: parseInt };
  vm.createContext(sandbox);
  for (var i = 0; i < scripts.length; i++) {
    vm.runInContext(fs.readFileSync(path.join(dir, scripts[i]), 'utf8'), sandbox, { filename: scripts[i] });
  }
  return sandbox;
}

function assert(cond, msg) {
  if (!cond) { console.error('FAIL: ' + msg); process.exit(1); }
}

var S = loadSandbox();
console.log('=== Test 1: pure sandbox load ===');
assert(typeof S.CocosSec.createUserIdentity === 'function', 'auth API missing');
console.log('OK');

console.log('=== Test 2: SHA-256 ===');
assert(S.sha256_vm_test(), 'sha256 self-test');
assert(S.hex_sha256('hello').length === 64, 'sha256 hex length');
console.log('OK — sha256(hello) prefix: ' + S.hex_sha256('hello').substring(0, 16));

S.CocosSec.seedRandom(TEST_SEED);

console.log('=== Test 3: ECDH P-384 ===');
var alice = S.CocosSec.ecdhGenerateKeyPair();
S.CocosSec.seedRandom(TEST_SEED);
var bob = S.CocosSec.ecdhGenerateKeyPair();
var ax = S.CocosSec.ecdhSharedSecretX(alice.privHex, bob.pubHex);
var bx = S.CocosSec.ecdhSharedSecretX(bob.privHex, alice.pubHex);
assert(ax === bx, 'ECDH mismatch');
console.log('OK');

console.log('=== Test 4: ECDSA sign/verify ===');
S.CocosSec.seedRandom(TEST_SEED);
var id = S.CocosSec.createUserIdentity();
var msg = 'input|attack at dawn';
var sig = S.CocosSec.ecdsaSign(id.privHex, msg);
assert(sig != null && sig.rHex.length === 96, 'sig r length for P-384');
assert(S.CocosSec.ecdsaVerify(id.pubHex, msg, sig), 'ecdsa verify failed');
assert(!S.CocosSec.ecdsaVerify(id.pubHex, 'input|tampered', sig), 'ecdsa should reject tamper');
console.log('OK — sig prefix: ' + sig.rHex.substring(0, 16));

console.log('=== Test 5: register request ===');
S.CocosSec.seedRandom(TEST_SEED);
id = S.CocosSec.createUserIdentity();
var reg = S.CocosSec.buildRegisterRequest('alice', 'secret123', id, 'abc123nonce');
assert(reg != null && reg.action === 'register', 'register request');
assert(S.CocosSec.verifyRegisterRequest(reg), 'register verify failed');
var regTampered = reg;
regTampered.passwordHash = 'deadbeef';
assert(!S.CocosSec.verifyRegisterRequest(regTampered), 'register should reject tamper');
console.log('OK — passwordHash: ' + reg.passwordHash.substring(0, 16) + '...');

console.log('=== Test 6: sign-in request ===');
S.CocosSec.seedRandom(TEST_SEED);
id = S.CocosSec.createUserIdentity();
var login = S.CocosSec.buildSignInRequest('alice', id, 'challenge99', 'nonce88');
assert(login != null && S.CocosSec.verifySignInRequest(login), 'signin verify');
console.log('OK');

console.log('=== Test 7: signed user input ===');
S.CocosSec.seedRandom(TEST_SEED);
id = S.CocosSec.createUserIdentity();
var packet = S.CocosSec.wrapSignedInput('alice', id.pubHex, 'move north', S.CocosSec.signUserInput(id.privHex, 'move north'));
assert(S.CocosSec.verifySignedInput(packet), 'signed input verify');
packet.text = 'move south';
assert(!S.CocosSec.verifySignedInput(packet), 'signed input tamper');
console.log('OK');

console.log('=== Test 8: RSA-2048 roundtrip ===');
S.CocosSec.seedRandom(TEST_SEED);
var rsaKey = S.CocosSec.rsaGenerateKey();
var pt = S.CocosSec.rsaDecrypt(rsaKey, S.CocosSec.rsaEncrypt(rsaKey.n, rsaKey.e, 'hello cocos2d'));
assert(pt === 'hello cocos2d', 'RSA roundtrip');
console.log('OK');

console.log('');
console.log('All tests passed.');
