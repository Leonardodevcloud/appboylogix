// Lint do app: só regra de CORREÇÃO (o que quebra em execução), não de estilo.
// O objetivo é barrar no CI o erro que hoje só aparece no aparelho do entregador:
// variável que não existe, hook chamado fora de ordem, chave duplicada em objeto.
import reactHooks from 'eslint-plugin-react-hooks';

const GLOBAIS = Object.fromEntries([
  // React Native / Hermes
  'console', 'fetch', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate',
  'requestAnimationFrame', 'cancelAnimationFrame', 'AbortController', 'WebSocket', 'FormData', 'Blob',
  'URL', 'URLSearchParams', 'XMLHttpRequest', 'Promise', 'globalThis', 'global', '__DEV__', 'process',
  'require', 'module', 'alert', 'navigator', 'atob', 'btoa', 'TextEncoder', 'TextDecoder', 'performance',
  'queueMicrotask', 'Intl', 'structuredClone',
].map((g) => [g, 'readonly']));

export default [
  { ignores: ['node_modules/**', '.expo/**', 'dist/**', 'android/**', 'ios/**', 'web-build/**'] },
  {
    files: ['app/**/*.{js,jsx}', 'src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: GLOBAIS,
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'no-undef': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-const-assign': 'error',
      'no-import-assign': 'error',
      'no-func-assign': 'error',
      'no-unreachable': 'error',
      'no-self-assign': 'error',
      'no-unsafe-negation': 'error',
      'no-cond-assign': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
];
