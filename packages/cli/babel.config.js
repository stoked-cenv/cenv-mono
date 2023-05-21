module.exports = {
  presets: [
    ['@babel/preset-env', {targets: {node: 'current'}}],
    ['@babel/preset-typescript', {targets: {node: 'current'}}],
  ],
  plugins: [
    [
      "@babel/plugin-proposal-decorators",
      {
        "legacy": true
      }
    ],
  ]
};
