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

function KeyAccelerators(OS, keyModifierAliases) {
  this.OS = OS;
  this.keyModifierAliases = {
    shift: 'Shift',
    arrowup: 'ArrowUp',
    up: 'ArrowUp',
    arrowdown: 'ArrowDown',
    down: 'ArrowDown',
    arrowleft: 'ArrowLeft',
    left: 'ArrowLeft',
    arrowright: 'ArrowRight',
    right: 'ArrowRight',
    pageup: 'PageUp',
    pagedown: 'PageDown',
    printscreen: 'PrintScreen',
    plus: 'Plus',
    space: 'Space',
    tab: 'tab',
    backspace: 'Backspace',
    delete: 'Delete',
    insert: 'Insert',
    enter: 'Enter',
    return: 'Enter',
    escape: 'Escape',
    esc: 'Escape',
    capslock: 'CapsLock',
    accept: 'Accept',
    attn: 'Attn',
    cancel: 'Cancel',
    contextmenu: 'ContextMenu',
    execute: 'Execute',
    find: 'Find',
    help: 'Help',
    pause: 'Pause',
    play: 'Play',
    mediafastforward: 'MediaFastForward',
    mediapause: 'MediaPause',
    mediaplay: 'MediaPlay',
    mediaplaypause: 'MediaPlayPause',
    mediarecord: 'MediaRecord',
    mediarewind: 'MediaRewind',
    mediatracknext: 'MediaTrackNext',
    mediatrackprevious: 'MediaTrackPrevious',
    new: 'New',
    open: 'Open',
    print: 'Print',
    save: 'Save',
    spellcheck: 'SpellCheck',
    props: 'Props',
    select: 'Select',
    volumeup: 'VolumeUp',
    volumedown: 'VolumeDown',
    volumemute: 'VolumeMute',
    zoomin: 'ZoomIn',
    zoomout: 'ZoomOut',
  };
  for (var idx = 1; idx < 25; idx++) {
    this.keyModifierAliases[`f${idx}`] = `F${idx}`;
  }
  Object.assign(this.keyModifierAliases, keyModifierAliases);
}

// This is a barebones implementation of matching key-bindings
// (or as Electron calls them, "key accelerators"). For a more thorough
// implementation, the Mousetrap library could be used:
// https://github.com/ccampbell/mousetrap/blob/master/mousetrap.js
KeyAccelerators.prototype.matches = function(keyEvent, accelerators) {
  const isMac = this.OS === 'Darwin';
  const keyModifierAliases = this.keyModifierAliases;

  // Refer to this list for platform-specific behavior for modifier keys:
  // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/getModifierState
  const modifiersToMatch = {};

  // Refer to this list of all possible keys:
  // https://www.w3.org/TR/DOM-Level-3-Events-key/#key-value-tables
  const keysToMatch = {};

  (accelerators || '').replace(/\s/g, '').split('+').forEach((accelerator) => {
    let acceleratorLower = accelerator.toLowerCase();
    if (acceleratorLower.length === 1) {
      keysToMatch[acceleratorLower] = null;
      return;
    }
    // Interpret `alt/option` key on Mac as a `meta` key always.
    if (acceleratorLower.includes('control') || acceleratorLower.includes('ctrl') ||
        acceleratorLower.includes('command') || acceleratorLower.includes('cmd')) {
      modifiersToMatch[isMac ? 'Meta' : 'Control'] = null;
      return;
    }
    if ((!isMac && acceleratorLower === 'altgr') ||
        (isMac && acceleratorLower === 'option')) {
      modifiersToMatch.AltGr = null;
      return;
    }
    if ((!isMac && acceleratorLower === 'alt') ||
        (isMac && acceleratorLower === 'option')) {
      modifiersToMatch.Alt = null;
      return;
    }
    if (isMac && acceleratorLower === 'f5') {
      modifiersToMatch.Meta = null;
      // TODO: Figure out why Firefox's `KeyboardEvent#key` is returning `^` instead of `i`.
      // keysToMatch.r = null;
      keysToMatch['^'] = null;
      return;
    }
    if (isMac && acceleratorLower === 'f11') {
      modifiersToMatch.Control = null;
      modifiersToMatch.Meta = null;
      keysToMatch.F11 = null;
      return;
    }
    if (acceleratorLower[0] === 'f' && accelerator.length > 1 && accelerator.length < 2) {
      keysToMatch[`${acceleratorLower.charAt(0).toUpperCase()}${acceleratorLower.substr(1)}`] = null;
      return;
    }
    if (acceleratorLower in keyModifierAliases) {
      modifiersToMatch[acceleratorLower] = null;
      return;
    }
    keysToMatch[acceleratorLower] = null;
  });

  if (keyEvent.key) {
    Object.keys(keysToMatch).forEach((key) => {
      if (keyEvent.key.toLowerCase() === key.toLowerCase()) {
        keysToMatch[key] = true;
      }
    });
  }

  if ('Shift' in modifiersToMatch && keyEvent.shiftKey) {
    modifiersToMatch.Shift = true;
  }

  if ('Alt' in modifiersToMatch && keyEvent.altKey) {
    modifiersToMatch.Alt = true;
  }

  if ('Control' in modifiersToMatch && keyEvent.controlKey) {
    modifiersToMatch.Control = true;
  }

  if ('Meta' in modifiersToMatch && keyEvent.metaKey) {
    modifiersToMatch.Meta = true;
  }

  return Object.values(modifiersToMatch).every(value => !!value) &&
         Object.values(keysToMatch).every(value => !!value);
};

const keyAccelerators = new KeyAccelerators(Services.appinfo.OS);

/*

TODO: Support the following:

- CmdOrCtrl+F (F11)  // For application to enter fullscreen.
- CmdOrCtrl+M  // For application to be minimized.
- CmdOrCtrl+T  // For opening a new tab.
- CmdOrCtrl+W  // For closing a tab.
- CmdOrCtrl+I  // For opening the tab's page info modal window.
- Ctrl+Shift+I (Alt+Command+I),  // For toggling the Dev Tools.
- Ctrl+Shift+C (Alt+Command+C),  // For toggling the Dev Tools Inspector.
- Ctrl+Shift+K (Alt+Command+K),  // For toggling the Dev Tools Web Console.
- Ctrl+Shift+I (Alt+Command+S),  // For toggling the Dev Tools Debugger.

*/

window.addEventListener('load', event => {
  const browser = document.getElementById('content');
  const url = window.arguments[0];

  browser.loadURI(url, null, null);
  // dump instead of console.log to write to stdout for tests.
  dump(`opened ${url} in new window\n`);

  browser.addEventListener('keydown', event => {
    // Reload the web page when the `F5` key (or `Command+R` on Mac) is pressed.
    if (keyAccelerators.matches(event, 'F5')) {
      browser.reload();
    }

    if (Services.appinfo.OS === 'Darwin') {
      if (keyAccelerators.matches(event, 'Alt+Cmd+I')) {
        Runtime.openDevTools(browser);
      }
    }
    else {
      if (keyAccelerators.matches(event, 'Ctrl+Shift+I')) {
        Runtime.openDevTools(browser);
      }
    }

    // TODO: Handle other key bindings for other Dev Tools, tab management,
    // window management, etc.
  }, false, true);

}, false);
