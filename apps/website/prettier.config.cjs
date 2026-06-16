/** @type {import("prettier").Config} */
const config = {
  trailingComma: 'es5',
  semi: false,
  singleQuote: true,
  bracketSpacing: false,
  jsxSingleQuote: true,
  printWidth: 100,
  plugins: ['prettier-plugin-tailwindcss', 'prettier-plugin-astro'],
  overrides: [
    {
      files: '*.astro',
      options: {
        parser: 'astro',
      },
    },
  ],
}

module.exports = config
