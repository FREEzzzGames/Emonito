export default [{
  files: ['**/*.js'],
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    globals: {
      window: 'readonly', document: 'readonly', navigator: 'readonly',
      fetch: 'readonly', AbortController: 'readonly', setTimeout: 'readonly',
      clearTimeout: 'readonly', setInterval: 'readonly', requestAnimationFrame: 'readonly',
      Date: 'readonly', Number: 'readonly', String: 'readonly', Math: 'readonly',
      Object: 'readonly', Array: 'readonly', Map: 'readonly', Infinity: 'readonly',
      URL: 'readonly', URLSearchParams: 'readonly', Promise: 'readonly', Error: 'readonly', console: 'readonly',
      L: 'readonly', Chart: 'readonly'
    }
  },
  rules: {
    'no-unreachable': 'error',
    'no-constant-condition': 'error',
    'no-duplicate-imports': 'error'
  }
}];
