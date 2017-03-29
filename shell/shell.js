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

window.addEventListener('load', event => {
  const browser = document.getElementById('content');
  const url = window.arguments[0];

  browser.loadURI(url, null, null);
  console.log(`opened ${url} in new window`);
  Runtime.openDevTools(browser);

  browser.addEventListener('keydown', event => {
    // Reload the web page when the F5 key is pressed.
    if (event.keyCode && event.keyCode === 116 && !event.shiftKey &&
        !event.altKey && !event.ctrlKey && !event.metaKey) {
      browser.reload();
    }
  }, false, true);

}, false);
