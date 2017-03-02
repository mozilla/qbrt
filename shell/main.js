/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;
const { console } = Cu.import("resource://gre/modules/Console.jsm", {});
const { Runtime } = Cu.import("resource:///modules/Runtime.jsm", {});
const { Services } = Cu.import("resource://gre/modules/Services.jsm", {});

const WINDOW_FEATURES = [
  "width=640",
  "height=480",
  "resizable",
  "scrollbars",
].join(",");

const window = Services.ww.openWindow(null, Runtime.arguments[0], "_blank", WINDOW_FEATURES, null);
Runtime.openDevTools(window);
