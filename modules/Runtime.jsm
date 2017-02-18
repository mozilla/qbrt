/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;
const { console } = Cu.import("resource://gre/modules/Console.jsm", {});
const { NetUtil } = Cu.import("resource://gre/modules/NetUtil.jsm", {});
const { Services } = Cu.import("resource://gre/modules/Services.jsm", {});
const ChromeRegistry = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIXULChromeRegistry);

this.EXPORTED_SYMBOLS = ["Runtime"];

this.Runtime = {
  start(appFile) {
    registerChromePrefix(appFile.parent);

    const systemPrincipal = Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal);

    const sandbox = new Cu.Sandbox(systemPrincipal, {
      wantComponents: true,
    });

    Services.scriptloader.loadSubScript(`chrome://app/content/${appFile.leafName}`, sandbox, 'UTF-8');
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
