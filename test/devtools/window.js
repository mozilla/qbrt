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

function loadDevToolsWindow(target) {
  const devToolsWindow = Runtime.openDevTools(target);
  return new Promise(resolve => {
    devToolsWindow.addEventListener('DOMContentLoaded', resolve);
  })
  .then(() => {
    // Wait for the DevTools window's title to change, which indicates
    // that the window has successfully connected to its target.
    // We dump the window title so the test can check stdout to confirm
    // that the correct set of windows was loaded.
    return new Promise(resolve => {
      const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
          if (mutation.attributeName === 'title') {
            dump(`${devToolsWindow.document.title}\n`);
            observer.disconnect();
            resolve();
          }
        }
      });
      observer.observe(devToolsWindow.document.querySelector('window'), { attributes: true });
    });
  })
  .then(() => {
    return new Promise(resolve => {
      devToolsWindow.addEventListener('unload', resolve);
      devToolsWindow.close();
    })
  });
}

window.addEventListener('load', event => {
  Promise.resolve()
  .then(() => {
    return loadDevToolsWindow(document.getElementById('browser-chrome'));
  })
  .then(() => {
    return loadDevToolsWindow(document.getElementById('browser-content-primary'));
  })
  .then(() => {
    return loadDevToolsWindow(document.getElementById('browser-content'));
  })
  .then(() => {
    return loadDevToolsWindow(window);
  })
  .then(() => {
    Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
  })
  .catch(error => {
    dump(`${error}\n`);
    Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
  });
});
