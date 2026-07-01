// cengine-bootstrap.js — load BEFORE jsrsasign-all-min.js (CEngine2d 1.5 / SpiderMonkey).
//
// jsrsasign 11.x reads navigator.appName at parse time. CEngine2d often has no
// navigator global, which causes: ReferenceError: navigator is not defined
//
// Safe for Node smoke tests and device. Do not wrap in an IIFE — assignment must
// reach the global object when scripts are loaded via require/js.include.

if (typeof navigator === "undefined") {
  navigator = {
    appName: "Netscape",
    appVersion: "5.0"
  };
}
