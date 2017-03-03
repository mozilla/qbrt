/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;

const { Runtime } = Cu.import('resource:///modules/Runtime.jsm', {});
const { Services } = Cu.import('resource://gre/modules/Services.jsm', {});
const { XPCOMUtils } = Cu.import('resource:///gre/modules/XPCOMUtils.jsm', {});

function CommandLineHandler() {}

CommandLineHandler.prototype = {
  classID: Components.ID('{236b79c3-ab58-446f-abba-4caba4deb337}'),

  /* nsISupports */

  QueryInterface: XPCOMUtils.generateQI([Ci.nsICommandLineHandler]),

  /* nsICommandLineHandler */

  helpInfo: '',

  handle: function(cmdLine) {
    // Firefox, in nsBrowserContentHandler, has a more robust handler
    // for the --chrome flag, which tries to correct typos in the URL
    // being loaded.  But we only need to handle loading devtools in a separate
    // process to debug the app itself, so our implementation is simpler.
    var chromeParam = cmdLine.handleFlagWithParam('chrome', false);
    if (chromeParam) {
      try {
        let resolvedURI = cmdLine.resolveURI(chromeParam);

        let isLocal = uri => {
          let localSchemes = new Set(['chrome', 'file', 'resource']);
          if (uri instanceof Components.interfaces.nsINestedURI) {
            uri = uri.QueryInterface(Components.interfaces.nsINestedURI).innerMostURI;
          }
          return localSchemes.has(uri.scheme);
        };
        if (isLocal(resolvedURI)) {
          // If the URI is local, we are sure it won't wrongly inherit chrome privs.
          let features = 'chrome,dialog=no,all';
          // For the "all" feature to be applied correctly, you must pass an
          // args array with at least one element.
          let windowArgs = Cc['@mozilla.org/supports-array;1'].createInstance(Ci.nsISupportsArray);
          windowArgs.AppendElement(null);
          Services.ww.openWindow(null, resolvedURI.spec, '_blank', features, windowArgs);
          cmdLine.preventDefault = true;
          return;
        } else {
          dump('*** Preventing load of web URI as chrome\n');
          dump('    If you\'re trying to load a webpage, do not pass --chrome.\n');
        }
      } catch (e) {
        dump(e + '\n');
      }
    }

    // Slurp arguments into an array we can pass to the app.
    let commandLineArgs = [];
    for (let i = 0; true; i++) {
      try {
        commandLineArgs.push(cmdLine.getArgument(i));
      } catch (ex) {
        if (ex.result == Cr.NS_ERROR_INVALID_ARG) {
          break;
        } else {
          throw ex;
        }
      }
    }

    let appURI;
    let appPath;

    try {
      appURI = Services.io.newURI(commandLineArgs[0], null, null);
    } catch (ex) {}

    if (appURI) {
      // If the app argument is a URI, run it in the shell.
      appPath = Services.dirsvc.get('CurProcD', Ci.nsIFile);
      appPath.append('shell');
      appPath.append('main.js');
    } else {
      appPath = cmdLine.resolveFile(commandLineArgs[0]);
      if (!appPath.exists()) {
        dump(`error: nonexistent app path: ${appPath.path}\n`);
        return;
      }
    }

    try {
      Runtime.start(appPath, commandLineArgs);
    } catch (ex) {
      dump(`error starting app: ${ex}\n`);
      Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
    }
  },
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([CommandLineHandler]);
