const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;
const { console } = Cu.import("resource://gre/modules/Console.jsm", {});
const { Services } = Cu.import("resource://gre/modules/Services.jsm", {});

const WINDOW_URL = "chrome://app/content/index.html";

const WINDOW_FEATURES = [
  "chrome",
  "close",
  "dialog=no",
  "extrachrome",
  "resizable",
  "scrollbars",
  "width=1024",
  "height=740",
].join(",");

console.log("Hello, World!");

Services.ww.openWindow(null, WINDOW_URL, "_blank", WINDOW_FEATURES, null);
