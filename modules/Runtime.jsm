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

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;
const { console } = Cu.import("resource://gre/modules/Console.jsm", {});
const { NetUtil } = Cu.import("resource://gre/modules/NetUtil.jsm", {});
const { Services } = Cu.import("resource://gre/modules/Services.jsm", {});
const ChromeRegistry = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIXULChromeRegistry);

this.EXPORTED_SYMBOLS = ["Runtime"];

const private = {};

this.Runtime = {
  get arguments() { return private.arguments.slice() },

  start(appFile, arguments) {
    registerChromePrefix(appFile.parent);

    const systemPrincipal = Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal);

    const sandbox = new Cu.Sandbox(systemPrincipal, {
      wantComponents: true,
    });

    private.arguments = arguments;

    Services.scriptloader.loadSubScript(`chrome://app/content/${appFile.leafName}`, sandbox, 'UTF-8');
  },

  openDevTools(window) {
    // TODO: When tools can be opened inside the content window, support
    // `detach` option to force into a new window instead.

    // Ensure DevTools core modules are loaded, including support for the about
    // URL below which is registered dynamically.
    const { loader } = Cu.import("resource://devtools/shared/Loader.jsm", {});
    loader.require("devtools/client/framework/devtools-browser");

    // The current approach below avoids the need for a container window
    // wrapping a tools frame, but it does replicate close handling, etc.
    // Historically we would have used toolbox-hosts.js to handle this, but
    // DevTools will be moving away from that, and so it seems fine to
    // experiment with toolbox management here.
    let id = window.QueryInterface(Ci.nsIInterfaceRequestor)
                   .getInterface(Ci.nsIDOMWindowUtils)
                   .outerWindowID;
    let url = `about:devtools-toolbox?type=window&id=${id}`;
    let features = "chrome,resizable,centerscreen," +
                   "width=1024,height=768";
    let toolsWindow = Services.ww.openWindow(null, url, null, features, null);

    let onLoad = () => {
      toolsWindow.removeEventListener("load", onLoad);
      toolsWindow.addEventListener("unload", onUnload);
    }
    let onUnload = () => {
      toolsWindow.removeEventListener("unload", onUnload);
      toolsWindow.removeEventListener("message", onMessage);
    }

    // Close the DevTools window if the browser window closes
    let onBrowserClosed = () => {
      toolsWindow.close();
    };

    // Listen for the toolbox's built-in close button, which sends a message
    // asking the toolbox's opener how to handle things.  In this case, just
    // close the toolbox.
    let onMessage = ({ data }) => {
      // Sometimes `data` is a String (f.e. on toolbox-title or toolbox-close),
      // while other times it's an Object (f.e. on set-host-title), which feels
      // like an upstream bug.  Anyway, for now we parse it conditionally.
      if (typeof data === 'string') {
        data = JSON.parse(data);
      }

      switch (data.name) {
        case "toolbox-close":
          toolsWindow.close();
          break;
        // We get both set-host-title and toolbox-title, and they provide
        // the same title, although their semantics vary.  Weird, but we simply
        // ignore one and use the other.
        case "set-host-title":
          toolsWindow.document.title = data.title;
          break;
        // case "toolbox-title":
        //   toolsWindow.document.title = data.data.value;
        //   break;
      }
    };

    toolsWindow.addEventListener("message", onMessage);
    toolsWindow.addEventListener("load", onLoad);
    window.addEventListener('close', onBrowserClosed);
  },

};

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

function registerChromePrefix(appDir) {
  let appDirURI = Services.io.newFileURI(appDir);
  let manifestText = `content app ${appDirURI.spec}/`;

  const tempFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
  tempFile.append("temp.manifest");
  tempFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);

  let fileStream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
  fileStream.init(tempFile, -1, -1, 0);
  fileStream.write(manifestText, manifestText.length);
  fileStream.close();

  Components.manager.QueryInterface(Ci.nsIComponentRegistrar).autoRegister(tempFile);
  ChromeRegistry.checkForNewChrome();

  tempFile.remove(false);
}
