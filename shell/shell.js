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

function Shortcuts() {
  this.isMac = Services.appinfo.OS === 'Darwin';
  this.keys = {
    i: 73,
    r: 82,
    f5: 116,
  };
}
Shortcuts.prototype.reloadPage = function(event) {
  dump(`reloadPage ${this.isMac} ${event.metaKey} ${event.ctrlKey} ` +
       `${event.keyCode === this.keys.r} ${event.keyCode}\n`);
  if (this.isMac) {
    // `Cmd + R` or `F5`.
    return (event.metaKey && event.keyCode === this.keys.r) || event.keyCode === this.keys.f5;
  }
  // `Ctrl + Shift + R`.
  return event.ctrlKey && event.keyCode === this.keys.r;
};
Shortcuts.prototype.hardReloadPage = function(event) {
  if (!event.shiftKey) {
    return false;
  }
  dump(`hardReloadPage ${this.isMac} ${event.shiftKey} ${event.metaKey} ` +
       `${event.ctrlKey} ${event.keyCode === this.keys.r} ${event.keyCode}\n`);
  if (this.isMac) {
    // `Cmd + R` or `F5`.
    return (event.metaKey && event.keyCode === this.keys.r) || event.keyCode === this.keys.f5;
  }
  // `Ctrl + Shift + R`.
  return event.ctrlKey && event.keyCode === this.keys.r;
};
Shortcuts.prototype.toggleDevTools = function(event) {
  dump(`openDevTools ${this.isMac} ${event.metaKey} ${event.altKey} ` +
       `${event.keyCode === this.keys.i}\n`);
  if (this.isMac) {
    // `Cmd + Alt + I`.
    return event.metaKey && event.altKey && event.keyCode === this.keys.i;
  }
  // `Ctrl + Shift + I`.
  return event.ctrlKey && event.shiftKey && event.keyCode === this.keys.i;
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
    let toolsWindow;

    // Focus the browser window when the application is opened.
    browser.focus();

    browser.loadURI(url, null, null);

    // dump instead of console.log to write to stdout for tests.
    dump(`opened ${url} in new window\n`);

    const onToolsKeydown = event => {
      dump('onToolsKeydown\n');
      // TODO: make this DRY, so we're not repeating ourselves below.
      if (shortcuts.hardReloadPage(event)) {
        browser.reload(true);
      }
      if (shortcuts.reloadPage(event)) {
        browser.reload();
      }
      if (shortcuts.toggleDevTools(event)) {
        dump('onToolsKeydown [shortcut OK]\n');
        Runtime.toggleDevTools(browser);
      }
    };

    const onToolsUnload = () => {
      dump('onToolsUnload\n');
      toolsWindow.removeEventListener('keydown', onToolsKeydown);
    };

    const onToolsLoad = () => {
      dump('onToolsLoad\n');
      toolsWindow.addEventListener('keydown', onToolsKeydown);
      toolsWindow.removeEventListener('unload', onToolsUnload);
    };

    browser.addEventListener('keydown', event => {
      // Hard-reload the web page when the `Shift + F5` keys (or `Command + Shift + R` on Mac) are pressed.
      if (shortcuts.hardReloadPage(event)) {
        browser.reload(true);
        return;
      }

      // Reload the web page when the `F5` key (or `Command + R` on Mac) is pressed.
      if (shortcuts.reloadPage(event)) {
        browser.reload();
        return;
      }

      if (shortcuts.toggleDevTools(event)) {
        if (toolsWindow) {
          const openedDevTools = Runtime.toggleDevTools(browser);
          if (openedDevTools) {
            // TODO: should we be handling this in `Runtime.jsm` instead?
            toolsWindow.addEventListener('load', onToolsLoad);
          }
          // TODO: handle when DevTools are destroyed.
        }
        else {
          toolsWindow = Runtime.openDevTools(browser);
          toolsWindow.addEventListener('load', onToolsLoad);
        }
      }
    }, false, true);
  },

  destroy: () => {
  },
};
