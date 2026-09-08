import next from '@next/eslint-plugin-next';

import base from '@eog/eslint-config';

export default [
  { ignores: ['.next/**', 'public/sw.js', 'next-env.d.ts'] },
  ...base,
  {
    // Build scripts run in Node, not the browser.
    files: ['scripts/**/*.mjs', '*.config.{mjs,ts}'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { '@next/next': next },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs['core-web-vitals'].rules,
    },
  },
];
