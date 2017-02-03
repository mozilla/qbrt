/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;

Cu.import("resource:///modules/Runtime.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function CommandLineHandler() {}

CommandLineHandler.prototype = {
  classID: Components.ID("{236b79c3-ab58-446f-abba-4caba4deb337}"),

  /* nsISupports */

  QueryInterface: XPCOMUtils.generateQI([Ci.nsICommandLineHandler]),

  /* nsICommandLineHandler */

  helpInfo: "",

  handle: function(cmdLine) {
    // Firefox, in nsBrowserContentHandler, has a more robust handler
    // for the --chrome flag, which tries to correct typos in the URL
    // being loaded.  But we only need to handle loading devtools in a separate
    // process to debug the app itself, so our implementation is simpler.
    var chromeParam = cmdLine.handleFlagWithParam("chrome", false);
    if (chromeParam) {
      try {
        let resolvedURI = cmdLine.resolveURI(chromeParam);

        let isLocal = uri => {
          let localSchemes = new Set(["chrome", "file", "resource"]);
          if (uri instanceof Components.interfaces.nsINestedURI) {
            uri = uri.QueryInterface(Components.interfaces.nsINestedURI).innerMostURI;
          }
          return localSchemes.has(uri.scheme);
        };
        if (isLocal(resolvedURI)) {
          // If the URI is local, we are sure it won't wrongly inherit chrome privs.
          let features = "chrome,dialog=no,all";
          // For the "all" feature to be applied correctly, you must pass an
          // args array with at least one element.
          var args = Cc["@mozilla.org/supports-array;1"].createInstance(Ci.nsISupportsArray);
          args.AppendElement(null);
          Services.ww.openWindow(null, resolvedURI.spec, "_blank", features, args);
          cmdLine.preventDefault = true;
          return;
        } else {
          dump("*** Preventing load of web URI as chrome\n");
          dump("    If you're trying to load a webpage, do not pass --chrome.\n");
        }
      }
      catch (e) {
        dump(e + '\n');
      }
    }

    let appPath;
    try {
      appPath = cmdLine.getArgument(0);
    } catch (e) {
      if (e.result == Cr.NS_ERROR_INVALID_ARG) {
        dump("error: no app provided\n");
        Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
        return;
      } else {
        throw e;
      }
    }

    let appURI = Services.io.newURI(appPath, null, Services.io.newFileURI(cmdLine.workingDirectory));
    dump("Loading app at " + appPath + " with URI " + appURI.spec + "\n");

    Runtime.start(appURI);
  },
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([CommandLineHandler]);
