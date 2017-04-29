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
const { Runtime } = Cu.import('resource://qbrt/modules/Runtime.jsm', {});
const { Services } = Cu.import('resource://gre/modules/Services.jsm', {});

const windowFeatures = [
  'width=640',
  'height=480',
  'resizable',
  'scrollbars',
].join(',');

// On startup, activate ourselves, since starting up from Node doesn't do this.
// TODO: do this by default for all apps started via Node.
if (Services.appinfo.OS === 'Darwin') {
  Cc['@mozilla.org/widget/macdocksupport;1'].getService(Ci.nsIMacDockSupport).activateApplication(true);
}

const url = Runtime.commandLineArgs[0] || Runtime.packageJSON.mainURL || 'index.html';
const shellUrl = `chrome://app/content/shell.xul`;

// // We should be able to use window.open here, but we're using the hidden window
// // as our window global object, and calling window.open on it throws:
// //   JavaScript error: …nsPrompter.js, line 350: NS_ERROR_NOT_AVAILABLE:
// //   Cannot call openModalWindow on a hidden window
// //
// // window.open(shellUrl, '_blank', windowFeatures);
// Services.ww.openWindow(null, shellUrl, '_blank', windowFeatures, null);

// Keep messing around with using window.open to open the window.
const shell = window.open(shellUrl, '_blank', windowFeatures);
dump(`shell: ${shell}\n`);
shell.addEventListener('load', event => shell.loadURL(url), false);
