'use strict';

module.exports = {
  env: {
    es6: true,
    node: true,
  },

  extends: 'eslint:recommended',

  // All of these globals rules apply only to certain files, so we might
  // move them into file-specific settings, although it's a pain.
  globals: {
    Components: false,
    document: false,
    dump: false,
    pref: false,
    window: false,
  },

  parserOptions: {
    ecmaVersion: 8,
  },

  rules: {
    'brace-style': ['error', 'stroustrup', { allowSingleLine: true }],
    'comma-dangle': ['error', 'always-multiline'],
    'indent': [ 'error', 2, { SwitchCase: 1 }],
    'linebreak-style': ['error', 'unix'],
    'no-console': 'off',
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-empty': ['error', { allowEmptyCatch: true }],

    // Cc, Ci, Cr, and Cu are effectively default globals that we define
    // in many scripts as shorthands for properties of the Components global.
    // Their definition is boilerplate that we don't want to customize
    // for each script, so we ignore their nonuse via a varsIgnorePattern.
    //
    // Some of our function definitions are XPCOM interface implementations,
    // and they don't always use all the arguments defined by the interface,
    // but it's still useful to declare their parameters, to make the interface
    // specification more obvious, so we ignore their nonuse via args: none.
    //
    'no-unused-vars': ['error', { varsIgnorePattern: 'Cc|Ci|Cr|Cu', args: 'none' }],

    'quotes': ['error', 'single'],
    'quote-props': ['error', 'consistent-as-needed'],
    'semi': ['error', 'always'],
    'space-before-function-paren': ['error', 'never'],
  },
};
