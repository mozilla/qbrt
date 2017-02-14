/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;
const { console } = Cu.import("resource://gre/modules/Console.jsm", {});
const { NetUtil } = Cu.import("resource://gre/modules/NetUtil.jsm", {});
const { Services } = Cu.import("resource://gre/modules/Services.jsm", {});

this.EXPORTED_SYMBOLS = ["Runtime"];

const systemPrincipal = Cc["@mozilla.org/systemprincipal;1"].
                        createInstance(Ci.nsIPrincipal);

const sandbox = new Cu.Sandbox(systemPrincipal, {
  // Eventually we should set wantsComponents: false and give the script
  // a more standard mechanism for accessing system APIs, like an ES6 module
  // loader.  But for now we provide Components.
  wantComponents: true,
});

// For convenience, provide the console object by default.
sandbox.console = console;
sandbox.Services = Services;

this.Runtime = {
  start(uri) {
    if (uri.scheme !== 'file') {
      throw new Error('cannot start app from URL with spec ' + uri.scheme);
    }

    registerChromePrefix(uri);

    const src = this._readURI(uri);
    Cu.evalInSandbox(src, sandbox, "latest", uri.path, 1);
  },

  _readURI(uri) {
    // Read the URI synchronously.
    let channel = NetUtil.newChannel({
      uri: uri,
      loadUsingSystemPrincipal: true,
    });
    let stream = channel.open2();

    let src = "";
    let cstream = Cc["@mozilla.org/intl/converter-input-stream;1"].
                  createInstance(Ci.nsIConverterInputStream);
    cstream.init(stream, "UTF-8", 0, 0);

    let str = {};
    let read = 0;
    do {
      read = cstream.readString(0xffffffff, str);
      src += str.value;
    } while (read != 0);
    cstream.close();

    return src;
  },

};

// XXX Clean up all this code, most of which is copied from some test head
// and seems to contain some redundancy.

function registerChromePrefix(uri) {
  let file = uri.QueryInterface(Ci.nsIFileURL).file;
  let manifestText = `content app ${file.parent.path}/`;
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
