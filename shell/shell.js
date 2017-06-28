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

const Accelerators = {
  isMac: Services.appinfo.OS === 'Darwin',
  keys: {
    i: 73,
    r: 82,
    f5: 116,
  },
  Reload: function(event) {
    const f5 = event.keyCode === this.keys.f5;
    if (f5) {
      return true;
    }
    if (this.isMac) {
      // `Cmd + R`.
      const cmdR = event.metaKey && event.keyCode === this.keys.r;
      return cmdR;
    }
    // `Ctrl + R`.
    const ctrlR = event.ctrlKey && event.keyCode === this.keys.r;
    return ctrlR;
  },
  HardReload: function(event) {
    // `Shift + F5`.
    const shiftF5 = event.shiftKey && event.keyCode === this.keys.f5;
    if (shiftF5) {
      return true;
    }
    if (this.isMac) {
      // `Cmd + Shift + R`.
      const cmdShiftR = event.metaKey && event.shiftKey && event.keyCode === this.keys.r;
      return cmdShiftR;
    }
    // `Ctrl + Shift + R`.
    const ctrlShiftR = event.ctrlKey && event.shiftKey &&
      event.keyCode === this.keys.r;
    return ctrlShiftR;
  },
  ToggleDevTools: function(event) {
    if (this.isMac) {
      // `Cmd + Alt + I`.
      const cmdAltI = event.metaKey && event.altKey && event.keyCode === this.keys.i;
      return cmdAltI;
    }
    // `Ctrl + Shift + I`.
    const ctrlShiftI = event.ctrlKey && event.shiftKey && event.keyCode === this.keys.i;
    return ctrlShiftI;
  },
};

function Shortcuts() {
  this.accelerators = Accelerators;
  this.registered = [];
}
Shortcuts.prototype.register = function(acceleratorName, callback) {
  this.registered.push([acceleratorName, callback]);
};
Shortcuts.prototype.testEvent = function(event, acceleratorName) {
  if (!(acceleratorName in this.accelerators)) {
    return false;
  }
  return this.accelerators[acceleratorName](event);
};
Shortcuts.prototype.handleEvent = function(event) {
  for (let idx = 0; idx < this.registered.length; idx++) {
    let [ acceleratorName, callback ] = this.registered[idx];
    if (this.testEvent(event, acceleratorName)) {
      try {
        callback();
      }
      catch (ex) {
        dump(`error handling event: ${ex}\n`);
      }
    }
  }
};

const UI = {
  init: () => {
    const browser = UI.browser = document.getElementById('content');
    const url = UI.url = window.arguments[0];
    const shortcuts = UI.shortcuts = new Shortcuts();

    // Focus the browser window when the application is opened.
    browser.focus();

    browser.loadURI(url, null, null);

    // Dump instead of log to write to stdout for tests.
    dump(`opened ${url} in new window\n`);

    // Hard-reload the web page.
    // Windows/Linux: `Shift + F5` or `Ctrl + Shift + R`.
    // Mac:           `Shift + F5` or `Cmd + Shift + R`.
    shortcuts.register('HardReload', () => {
      // Bypass proxy and cache.
      const reloadFlags = Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_PROXY |
        Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE;
      browser.webNavigation.reload(reloadFlags);
    });

    // Reload the web page.
    // Windows/Linux: `F5` or `Ctrl + R`.
    // Mac:           `F5` or `Cmd + R`.
    shortcuts.register('Reload', () => {
      browser.reload();
    });

    // Toggle the DevTools.
    // Windows/Linux: `Ctrl + Shift + I`.
    // Mac:           `Cmd + Shift + I`.
    shortcuts.register('ToggleDevTools', () => {
      const toolsWindow = Runtime.toggleDevTools(browser);
      if (toolsWindow) {
        // DevTools window was created for the first time.
        toolsWindow.addEventListener('keydown', onToolsKeydown);
        toolsWindow.addEventListener('unload', onToolsUnload, { once: true });
      }
    });
    const onToolsKeydown = event => {
      // NB: the DevTools window handles its own reload key events,
      // so we don't need to handle them ourselves.
      if (shortcuts.testEvent(event, 'ToggleDevTools')) {
        Runtime.toggleDevTools(browser);
      }
    };
    const onToolsUnload = event => {
      const toolsWindow = event.target;
      toolsWindow.removeEventListener('keydown', onToolsKeydown);
    };

    // Handle browser-level keyboard shortcuts.
    browser.addEventListener('keydown', event => {
      shortcuts.handleEvent(event);
    }, false, true);
  },

  destroy: () => {
    UI.browser.removeEventListener('keydown', UI.shortcuts.handleEvent,
      false, true);
  },
};

window.addEventListener('load', UI.init.bind(UI), { once: true });
window.addEventListener('unload', UI.destroy.bind(UI), { once: true });
