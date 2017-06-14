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

const normalizePackageData = require('normalize-package-data');
const path = require('path');
const readPkgUp = require('read-pkg-up');

exports.readProjectMetadata = (projectDir, transformer) => {
  function transform(result) {
    if (typeof transformer === 'function') {
      result = transformer(result);
    }
    return result;
  }

  function removeUnused(metadata) {
    // Remove unneeded keys that were added by `normalize-package-data`.
    delete metadata._id;
    if (metadata.readme === 'ERROR: No README data found!') {
      delete metadata.readme;
    }
    return metadata;
  }

  return readPkgUp({cwd: projectDir}).then(result => {
    // If the app doesn't have a package.json file, then result.pkg will be
    // undefined, but we assume it's defined in other parts of the codebase,
    // so ensure that it's defined, even if it's just an empty object.
    result.pkg = result.pkg || {};

    // If the app doesn't have a package.json file, then result.path will be
    // undefined, but we assume it's defined in other parts of the codebase,
    // so ensure that it's defined, even if the file doesn't actually exist.
    result.path = result.path || path.join(projectDir, 'package.json');

    let metadata = result.pkg;

    result = transform(result);

    // `normalizePackageData` will throw if there are any errors
    // (e.g., invalid values for `name` or `version`) in the
    // `package.json` file.
    // To expose warnings, pass a callback as a second argument.
    try {
      normalizePackageData(metadata);
    }
    catch (error) {
      throw error;
    }

    result.pkg = removeUnused(metadata);

    return result;
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
};
