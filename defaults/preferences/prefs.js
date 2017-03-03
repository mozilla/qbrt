/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// App-specific preferences, in alphabetical order.

// Disabled, because for some reason it dumps:
// JavaScript error: resource://gre/components/nsPrompter.js, line 350: NS_ERROR_NOT_AVAILABLE: Cannot call openModalWindow on a hidden window
// pref("browser.dom.window.dump.enabled", true);

pref("devtools.chrome.enabled", true);
pref("devtools.debugger.prompt-connection", false);
pref("devtools.debugger.remote-enabled", true);
pref("devtools.selfxss.count", 5);
pref("dom.mozBrowserFramesEnabled", true);
pref("javascript.options.showInConsole", true);

// Ideally, this would disable telemetry, but it doesn't actually work
// (at least it doesn't disable code that spews errors into the console),
// so we also override the @mozilla.org/base/telemetry-startup;1 XPCOM contract
// with a custom component DisabledTelemetryStartup that ignores
// the app-startup and profile-after-change messages.
pref("toolkit.telemetry.enabled", false);
