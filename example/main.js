/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

'use strict';

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;
const { console } = Cu.import('resource://gre/modules/Console.jsm', {});
const { Runtime } = Cu.import('resource://qbrt/modules/Runtime.jsm', {});
const { Services } = Cu.import('resource://gre/modules/Services.jsm', {});

const WINDOW_URL = 'chrome://app/content/index.html';
const WINDOW_DEFAULTS = {
  dialog: false,
  width: 640,
  height: 480
};

function BrowserWindow (opts) {
  opts = Object.assign({}, WINDOW_DEFAULTS, opts);
  this.windowFeatures = () => {
    return [
      'chrome',
      `dialog=${opts.dialog ? 'yes' : 'no'}`,
      'all',
      `width=${opts.width}`,
      `height=${opts.height}`,
    ].join(',');
  };
}
BrowserWindow.prototype.loadURL = url => {
  return Services.ww.openWindow(null, url, '_blank', this.windowFeatures(), null);
};
BrowserWindow.prototype.webContents = {
  openDevTools: () => Runtime.openDevTools(win)
};

// On startup, activate ourselves, since starting up from Node doesn't do this.
// TODO: do this by default for all apps started via Node.
if (Services.appinfo.OS === 'Darwin') {
  Cc['@mozilla.org/widget/macdocksupport;1'].getService(Ci.nsIMacDockSupport).activateApplication(true);
}

console.log('Hello, World!');

const win = new BrowserWindow({
  width: 800,
  height: 600
});

win.loadURL(WINDOW_URL);

// Open the DevTools.
win.webContents.openDevTools();
