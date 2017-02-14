/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;
const { console } = Cu.import("resource://gre/modules/Console.jsm", {});
const { NetUtil } = Cu.import("resource://gre/modules/NetUtil.jsm", {});
const { Services } = Cu.import("resource://gre/modules/Services.jsm", {});

this.EXPORTED_SYMBOLS = ["Runtime"];

this.Runtime = {
  start(appFile) {
    registerChromePrefix(appFile.parent.path);

    const systemPrincipal = Cc["@mozilla.org/systemprincipal;1"].
                            createInstance(Ci.nsIPrincipal);

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

// XXX Clean up all this code, most of which is copied from some test head
// and seems to contain some redundancy.

function registerChromePrefix(path) {
  let manifestText = `content app ${path}/`;
  createManifestTemporarily(gDirSvc.get("ProfD", Ci.nsIFile), manifestText);
}

var gDirSvc    = Cc["@mozilla.org/file/directory_service;1"].
  getService(Ci.nsIDirectoryService).QueryInterface(Ci.nsIProperties);

var gChromeReg = Cc["@mozilla.org/chrome/chrome-registry;1"].
                    getService(Ci.nsIXULChromeRegistry);

function copyToTemporaryFile(f) {
  let tmpd = gDirSvc.get("ProfD", Ci.nsIFile);
  tmpf = tmpd.clone();
  tmpf.append("temp.manifest");
  tmpf.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
  tmpf.remove(false);
  f.copyTo(tmpd, tmpf.leafName);
  return tmpf;
}

function createManifestTemporarily(tempDir, manifestText) {
  tempDir.append("temp.manifest");

  let foStream = Cc["@mozilla.org/network/file-output-stream;1"]
                   .createInstance(Ci.nsIFileOutputStream);
  foStream.init(tempDir,
                0x02 | 0x08 | 0x20, 0o664, 0); // write, create, truncate
  foStream.write(manifestText, manifestText.length);
  foStream.close();
  let tempfile = copyToTemporaryFile(tempDir);

  Components.manager.QueryInterface(Ci.nsIComponentRegistrar).
    autoRegister(tempfile);

  gChromeReg.checkForNewChrome();
  // tempfile.fileSize = 0; // truncate the manifest
}
