// Example: login scene using pure jsbn (Cocos2d 1.5 style).
// Copy patterns into your scene; load jsbn scripts before this file.
//
// Required globals after script load: CocosSec, cc

var LoginCrypto = {
  SERVER_RSA_N: "",   // fill: 512-char hex modulus from openssl
  SERVER_RSA_E: "10001",
  SERVER_ECDH_PUB: "", // fill: server P-384 public point hex (starts with 04)

  init: function() {
    CocosSec.setErrorHandler(function(msg) {
      cc.log("[crypto] " + msg);
    });
  },

  // Call when server sends hello + 32-byte nonce (hex)
  onServerHello: function(serverNonceHex) {
    var serverBytes = CocosSec.hexToBytes(serverNonceHex);
    var clientBytes = CocosSec.gatherEntropyBytes(32);
    CocosSec.seedRandom(serverBytes.concat(clientBytes));

    var session = CocosSec.ecdhGenerateKeyPair();
    if(session == null) {
      cc.log("ECDH keygen failed");
      return;
    }

    cc.log("client pub prefix: " + session.pubHex.substring(0, 20));

    var sharedX = CocosSec.ecdhSharedSecretX(
      session.privHex,
      LoginCrypto.SERVER_ECDH_PUB
    );

    // Example: RSA-wrap a short login token for the server
    var token = "player42|" + sharedX.substring(0, 16);
    var cipher = CocosSec.rsaEncrypt(
      LoginCrypto.SERVER_RSA_N,
      LoginCrypto.SERVER_RSA_E,
      token
    );

    if(cipher == null) {
      cc.log("RSA encrypt failed");
      return;
    }

    cc.log("login cipher len: " + cipher.length); // expect 512 for RSA-2048
    sendLoginToServer(session.pubHex, cipher);
  }
};

function sendLoginToServer(clientEcdhPubHex, rsaCipherHex) {
  // Your HTTP / socket code here
}
