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

function dumpWindowTitle(devToolsWindow) {
  return new Promise(resolve => {
    function checkTitle() {
      if (devToolsWindow.document.title == '') {
        sleep(100).then(checkTitle);
      }
      else {
        dump(`${devToolsWindow.document.title}\n`);
        resolve();
      }
    }
    checkTitle();
  });
}

function loadWindow(target) {
  const devToolsWindow = Runtime.openDevTools(target);
  return dumpWindowTitle(devToolsWindow).then(() => {
    devToolsWindow.close();
  });
}

window.addEventListener('load', event => {
  Promise.resolve()
  .then(() => {
    return loadWindow(document.getElementById('browser-chrome'));
  })
  .then(() => {
    return loadWindow(document.getElementById('browser-content-primary'));
  })
  .then(() => {
    return loadWindow(document.getElementById('browser-content'));
  })
  .then(() => {
    return loadWindow(window);
  })
  .then(() => {
    Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
  });
});
