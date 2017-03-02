/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;
const { console } = Cu.import("resource://gre/modules/Console.jsm", {});
const { Services } = Cu.import("resource://gre/modules/Services.jsm", {});

console.log("Hello, World!");

Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
