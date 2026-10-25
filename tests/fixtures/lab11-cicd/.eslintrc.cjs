module.exports = {
  root: true,

  env: {
    browser: true,
    es2022: true,
    node: true,
  },

  parser: "@typescript-eslint/parser",

  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },

  plugins: ["@typescript-eslint"],

  rules: {
    "no-debugger": "error",
    "no-console": "off",
  },

  ignorePatterns: [
    "dist/",
    "node_modules/",
    "fixtures/",
    "reports/",
  ],
};