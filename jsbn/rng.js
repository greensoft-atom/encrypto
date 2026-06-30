// Random number generator - requires a PRNG backend, e.g. prng4.js
// Safe for embedded runtimes (Cocos2d, SpiderMonkey, etc.) with no browser globals.

var rng_state;
var rng_pool;
var rng_pptr;

// Optional error hook for embeddable hosts (no alert() dependency).
function jsbn_error(msg) {
  if(typeof jsbn_onerror == "function") {
    jsbn_onerror(msg);
  }
}

// Mix in a 32-bit integer into the pool
function rng_seed_int(x) {
  rng_pool[rng_pptr++] ^= x & 255;
  rng_pool[rng_pptr++] ^= (x >> 8) & 255;
  rng_pool[rng_pptr++] ^= (x >> 16) & 255;
  rng_pool[rng_pptr++] ^= (x >> 24) & 255;
  if(rng_pptr >= rng_psize) rng_pptr -= rng_psize;
}

// Mix bytes from an array into the pool (call from native secure RNG when available)
function rng_seed_bytes(ba) {
  var i;
  for(i = 0; i < ba.length; ++i) {
    rng_pool[rng_pptr++] ^= ba[i] & 255;
    if(rng_pptr >= rng_psize) rng_pptr -= rng_psize;
  }
}

// Mix in the current time (w/milliseconds) into the pool
function rng_seed_time() {
  rng_seed_int(new Date().getTime());
}

function rng_init_pool() {
  if(rng_pool != null) return;
  rng_pool = new Array();
  rng_pptr = 0;
  var t;
  if(typeof window != "undefined" && window && window.crypto && window.crypto.getRandomValues) {
    var ua;
    if(typeof Uint8Array != "undefined") {
      ua = new Uint8Array(32);
      window.crypto.getRandomValues(ua);
      for(t = 0; t < 32; ++t)
        rng_pool[rng_pptr++] = ua[t];
    }
  }
  if(typeof navigator != "undefined" && navigator &&
     navigator.appName == "Netscape" && navigator.appVersion < "5" &&
     typeof window != "undefined" && window && window.crypto) {
    var z = window.crypto.random(32);
    for(t = 0; t < z.length; ++t)
      rng_pool[rng_pptr++] = z.charCodeAt(t) & 255;
  }
  while(rng_pptr < rng_psize) {
    t = Math.floor(65536 * Math.random());
    rng_pool[rng_pptr++] = t >>> 8;
    rng_pool[rng_pptr++] = t & 255;
  }
  rng_pptr = 0;
  rng_seed_time();
}

rng_init_pool();

function rng_reset() {
  rng_state = null;
  rng_pptr = 0;
}

// Fill the pool from caller bytes (repeated if shorter than pool). Used for explicit seeding.
function rng_set_pool_from_bytes(bytes) {
  var i, j;
  if(rng_pool == null) {
    rng_pool = new Array();
  }
  for(i = 0; i < rng_psize; ++i) {
    rng_pool[i] = bytes[i % bytes.length] & 255;
  }
  rng_pptr = 0;
}

function rng_get_byte() {
  if(rng_state == null) {
    rng_state = prng_newstate();
    rng_state.init(rng_pool);
    for(rng_pptr = 0; rng_pptr < rng_pool.length; ++rng_pptr)
      rng_pool[rng_pptr] = 0;
    rng_pptr = 0;
  }
  return rng_state.next();
}

function rng_get_bytes(ba) {
  var i;
  for(i = 0; i < ba.length; ++i) ba[i] = rng_get_byte();
}

function SecureRandom() {}

SecureRandom.prototype.nextBytes = rng_get_bytes;
