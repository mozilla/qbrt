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

console = {
  log: function (msg) {
    dump(msg + '\n');
  }
};

function Shortcuts() {
  this.isMac = Services.appinfo.OS === 'Darwin';
  this.keys = {
    i: 73,
    r: 82,
    f5: 116,
  };
}
Shortcuts.prototype.reloadPage = function(event) {
  if (this.isMac) {
    // `Cmd + R`.
    const cmdR = event.metaKey && event.keyCode === this.keys.r;
    if (cmdR) {
      console.log('`Cmd + R`');
    }
    // `F5`.
    const f5 = event.keyCode === this.keys.f5;
    if (f5) {
      console.log('`F5`');
    }
    return cmdR || f5;
  }
  // `Ctrl + Shift + R`.
  const ctrlShiftR = event.ctrlKey && event.keyCode === this.keys.r;
  if (ctrlShiftR) {
    console.log('`Ctrl + Shift + R`');
  }
  return ctrlShiftR;
};
Shortcuts.prototype.hardReloadPage = function(event) {
  // `Shift + F5`.
  const shiftF5 = event.shiftKey && event.keyCode === this.keys.f5;
  if (shiftF5) {
    console.log(`F5`);
    return true;
  }
  if (this.isMac) {
    // `Cmd + Shift + R`.
    const cmdShiftR = event.metaKey && event.shiftKey && event.keyCode === this.keys.r;
    if (cmdShiftR) {
      console.log(`Cmd + Shift + R`);
    }
    return cmdShiftR;
  }
  // `Ctrl + Shift + R`.
  const ctrlShiftR = event.ctrlKey && event.shiftKey && event.keyCode === this.keys.r;
  if (ctrlShiftR) {
    console.log(`Ctrl + Shift + R`);
  }
  return ctrlShiftR;
};
Shortcuts.prototype.toggleDevTools = function(event) {
  if (this.isMac) {
    // `Cmd + Alt + I`.
    const cmdAltI = event.metaKey && event.altKey && event.keyCode === this.keys.i;
    if (cmdAltI) {
      console.log(`Ctrl + Shift + I`);
    }
    return cmdAltI;
  }
  // `Ctrl + Shift + I`.
  const ctrlShiftI = event.ctrlKey && event.shiftKey && event.keyCode === this.keys.i;
  if (ctrlShiftI) {
    console.log(`Ctrl + Shift + I`);
  }
  return ctrlShiftI;
};
Shortcuts.prototype.openDevTools = Shortcuts.prototype.toggleDevTools;
Shortcuts.prototype.closeDevTools = Shortcuts.prototype.toggleDevTools;

window.addEventListener('load', () => {
  UI.init();
}, { once: true });

window.addEventListener('unload', () => {
  UI.destroy();
}, { once: true });

const UI = {
  init: () => {
    const browser = document.getElementById('content');
    const url = window.arguments[0];
    const shortcuts = new Shortcuts();

    // Focus the browser window when the application is opened.
    browser.focus();

    browser.loadURI(url, null, null);

    // Dump instead of log to write to stdout for tests.
    dump(`opened ${url} in new window\n`);

    const onToolsKeydown = event => {
      // NB: the DevTools window handles its own reload key events,
      // so we don't need to handle them ourselves.
      // TODO: make this DRY, so we're not repeating ourselves below.
      if (shortcuts.toggleDevTools(event)) {
        console.log('[devtools] toggle DevTools upon keydown');
        Runtime.toggleDevTools(browser);
      }
    };

    const onToolsUnload = event => {
      console.log('[devtools] unload');
      const toolsWindow = event.target;
      toolsWindow.removeEventListener('keydown', onToolsKeydown);
    };

    browser.addEventListener('keydown', event => {
      // Hard-reload the web page.
      // Windows/Linux: `F5` or `Ctrl + Shift + R`.
      // Mac:           `F5` or `Cmd + Shift + R`.
      if (shortcuts.hardReloadPage(event)) {
        // Bypass proxy and cache.
        const reloadFlags = Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_PROXY | Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE;
        browser.webNavigation.reload(reloadFlags);
        return;
      }

      // Reload the web page.
      // Windows/Linux: `F5` or `Ctrl + R`.
      // Mac:           `F5` or `Command + R`.
      if (shortcuts.reloadPage(event)) {
        browser.reload();
        return;
      }

      if (shortcuts.toggleDevTools(event)) {
        const toolsWindow = Runtime.toggleDevTools(browser);
        if (toolsWindow) {
          console.log('`toolsWindow` created');
          // DevTools window was created for the first time.
          toolsWindow.addEventListener('keydown', onToolsKeydown);
          toolsWindow.addEventListener('unload', onToolsUnload, { once: true });
        }
      }
    }, false, true);
  },

  destroy: () => {
  },
};
