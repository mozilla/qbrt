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
const { Services } = Cu.import('resource://gre/modules/Services.jsm', {});
const ChromeRegistry = Cc['@mozilla.org/chrome/chrome-registry;1'].getService(Ci.nsIXULChromeRegistry);

this.EXPORTED_SYMBOLS = ['Runtime'];

const global = this;

this.Runtime = {
  get commandLineArgs() { return global.commandLineArgs },
  get packageJSON() { return global.packageJSON },

  start(appFile, commandLineArgs, packageJSON) {
    // TODO: stop assuming that appFile is in the topmost directory of the app.
    // Instead, either traverse the path backwards until we find the package
    // manifest, or make the caller specify the app directory in addition to
    // the app file.
    registerChromePrefix(appFile.parent);

    const systemPrincipal = Cc['@mozilla.org/systemprincipal;1'].createInstance(Ci.nsIPrincipal);

    const sandbox = new Cu.Sandbox(systemPrincipal, {
      wantComponents: true,
    });

    global.commandLineArgs = commandLineArgs;
    global.packageJSON = packageJSON;

    Services.scriptloader.loadSubScript(`chrome://app/content/${appFile.leafName}`, sandbox, 'UTF-8');
  },

  openDevTools(target) {
    // TODO: When tools can be opened inside the target window, support
    // `detach` option to force into a new window instead.

    // Ensure DevTools core modules are loaded, including support for the about
    // URL below which is registered dynamically.
    const { loader } = Cu.import('resource://devtools/shared/Loader.jsm', {});
    loader.require('devtools/client/framework/devtools-browser');

    // The current approach below avoids the need for a container window
    // wrapping a tools frame, but it does replicate close handling, etc.
    // Historically we would have used toolbox-hosts.js to handle this,
    // but DevTools will be moving away from that, and so it seems fine
    // to experiment with toolbox management here.

    // Determine the target's type, id, and associated application window
    // (which could be the target itself).  Currently we support targets
    // that are <xul:browser> elements (i.e. have a outerWindowID property)
    // and those that are ChromeWindow (i.e. don't have such a property).
    //
    // We also distinguish between <xul:browser> elements that are
    // type="content*" and those that are not (and therefore chrome),
    // as the latter need their type set to "window", because:
    // http://searchfox.org/mozilla-central/rev/fcd9f14/devtools/server/actors/webbrowser.js#329-333.
    //
    const [type, id, appWindow] = 'outerWindowID' in target ?
      target.getAttribute('type').startsWith('content') ?
        ['tab', target.outerWindowID, target.ownerGlobal] :
        ['window', target.outerWindowID, target.ownerGlobal] :
      ['window', getOuterWindowID(target), target];

    const url = `about:devtools-toolbox?type=${type}&id=${id}`;

    const features = 'chrome,resizable,centerscreen,width=1024,height=768';
    const toolsWindow = Services.ww.openWindow(null, url, null, features, null);

    const onLoad = () => {
      toolsWindow.removeEventListener('load', onLoad);
      toolsWindow.addEventListener('unload', onUnload);
    };

    const onUnload = () => {
      toolsWindow.removeEventListener('unload', onUnload);
      toolsWindow.removeEventListener('message', onMessage);
    };

    // Close the DevTools window if the target window closes.
    const onTargetClose = () => {
      toolsWindow.close();
    };

    // Listen for the toolbox's built-in close button, which sends a message
    // asking the toolbox's opener how to handle things.  In this case, just
    // close the toolbox.
    const onMessage = ({ data }) => {
      // Sometimes `data` is a String (f.e. on toolbox-title or toolbox-close),
      // while other times it's an Object (f.e. on set-host-title), which feels
      // like an upstream bug.  Anyway, for now we parse it conditionally.
      if (typeof data === 'string') {
        data = JSON.parse(data);
      }

      switch (data.name) {
        case 'toolbox-close':
          toolsWindow.close();
          break;
        // We get both set-host-title and toolbox-title, and they provide
        // the same title, although their semantics vary.  Weird, but we simply
        // ignore one and use the other.
        case 'set-host-title':
          toolsWindow.document.title = data.title;
          break;
        // case 'toolbox-title':
        //   toolsWindow.document.title = data.data.value;
        //   break;
      }
    };

    toolsWindow.addEventListener('message', onMessage);
    toolsWindow.addEventListener('load', onLoad);
    appWindow.addEventListener('close', onTargetClose);

    return toolsWindow;
  },

  closeDevTools(target) {
    // TODO: Keep an object in memory that maps windows => opened Dev Tools?
    // Or query the active window and close the Dev Tools if it's already open?
    // (I assume the latter. What's the best way to go about this?)
  },

  toggleDevTools(target) {
  },

};

function registerChromePrefix(appDir) {
  let appDirURI = Services.io.newFileURI(appDir);
  let manifestText = `content app ${appDirURI.spec}/`;

  const tempFile = Services.dirsvc.get('TmpD', Ci.nsIFile);
  tempFile.append('temp.manifest');
  tempFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);

  let fileStream = Cc['@mozilla.org/network/file-output-stream;1'].createInstance(Ci.nsIFileOutputStream);
  fileStream.init(tempFile, -1, -1, 0);
  fileStream.write(manifestText, manifestText.length);
  fileStream.close();

  Components.manager.QueryInterface(Ci.nsIComponentRegistrar).autoRegister(tempFile);
  ChromeRegistry.checkForNewChrome();

  tempFile.remove(false);
}

function getOuterWindowID(window) {
  return window.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils).outerWindowID;
}
