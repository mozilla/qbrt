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

function sleep(n) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, n);
  });
}

function devToolsWindowTitle(devToolsWindow) {
  return new Promise(resolve => {
    devToolsWindow.addEventListener('load', async () => {
      while (devToolsWindow.document.title == '') {
        await sleep(100);
      }
      dump(`${devToolsWindow.document.title}\n`);
      resolve();
    });
  });
}

window.addEventListener('load', event => {
  (async function() {
    const targets = [
      document.getElementById('browser-chrome'),
      document.getElementById('browser-content-primary'),
      document.getElementById('browser-content'),
      window,
    ];
    for (const target of targets) {
      const devToolsWindow = Runtime.openDevTools(target);
      await devToolsWindowTitle(devToolsWindow);
      devToolsWindow.close();
    }
    Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
  })();
}, false);
