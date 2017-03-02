/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;
const { console } = Cu.import("resource://gre/modules/Console.jsm", {});
const { Runtime } = Cu.import("resource:///modules/Runtime.jsm", {});
const { Services } = Cu.import("resource://gre/modules/Services.jsm", {});

const WINDOW_URL = "chrome://app/content/index.html";

const WINDOW_FEATURES = [
  "chrome",
  "dialog=no",
  "all",
  "width=640",
  "height=480",
].join(",");

// On startup, activate ourselves, since starting up from Node doesn't do this.
// TODO: do this by default for all apps started via Node.
if (Services.appinfo.OS === 'Darwin') {
  Cc["@mozilla.org/widget/macdocksupport;1"].getService(Ci.nsIMacDockSupport).activateApplication(true);
}

console.log("Hello, World!");

const window = Services.ww.openWindow(null, WINDOW_URL, "_blank", WINDOW_FEATURES, null);
Runtime.openDevTools(window);
