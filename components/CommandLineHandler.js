/* Copyright 2017 Mozilla
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License. */

'use strict';

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;

const { NetUtil } = Cu.import('resource://gre/modules/NetUtil.jsm', {});
const { Runtime } = Cu.import('resource://qbrt/modules/Runtime.jsm', {});
const { Services } = Cu.import('resource://gre/modules/Services.jsm', {});
const { XPCOMUtils } = Cu.import('resource://gre/modules/XPCOMUtils.jsm', {});

function readFile(file) {
  let stream = NetUtil.newChannel({
    uri: file,
    loadUsingSystemPrincipal: true,
  }).open2();
  let count = stream.available();
  let data = NetUtil.readInputStreamToString(stream, count);
  stream.close();
  return data;
}

function CommandLineHandler() {}

CommandLineHandler.prototype = {
  classID: Components.ID('{236b79c3-ab58-446f-abba-4caba4deb337}'),

  /* nsISupports */

  QueryInterface: XPCOMUtils.generateQI([Ci.nsICommandLineHandler]),

  /* nsICommandLineHandler */

  helpInfo: '',

  handle: function(cmdLine) {
    // Prevent the runtime's default behavior so it doesn't happen in addition
    // to the behavior we specify.
    cmdLine.preventDefault = true;

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
        }
        else {
          dump('*** Preventing load of web URI as chrome\n');
          dump('    If you\'re trying to load a webpage, do not pass --chrome.\n');
        }
      }
      catch (e) {
        dump(e + '\n');
      }
    }

    const aqqArg = cmdLine.handleFlagWithParam('aqq', false);

    // Slurp arguments into an array we can pass to the app.
    let commandLineArgs = [];
    for (let i = 0; true; i++) {
      try {
        commandLineArgs.push(cmdLine.getArgument(i));
      }
      catch (ex) {
        if (ex.result == Cr.NS_ERROR_INVALID_ARG) {
          break;
        }
        else {
          throw ex;
        }
      }
    }

    let aqqPath, packageJSON = {};

    if (aqqArg) {
      aqqPath = cmdLine.resolveFile(aqqArg);
      if (!aqqPath.exists()) {
        dump(`error: nonexistent path: ${aqqPath.path}\n`);
        return;
      }
      // TODO: retrieve package.json data from path.
    }
    else {
      let webappDir = Services.dirsvc.get('CurProcD', Ci.nsIFile).parent;
      webappDir.append('webapp');
      let packageJsonFile = webappDir.clone();
      packageJsonFile.append('package.json');
      packageJSON = JSON.parse(readFile(packageJsonFile));

      // This will break if packageJSON.main is a path rather than just a filename.
      // TODO: resolve path properly.
      let mainFile = webappDir.clone();
      mainFile.append(packageJSON.main);
      aqqPath = mainFile;
    }

    try {
      Runtime.start(aqqPath, commandLineArgs, packageJSON);
    }
    catch (ex) {
      dump(`error starting runtime: ${ex}\n`);
      Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
    }
  },
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([CommandLineHandler]);
