const path = require('path');

const NODE_ENV = process.env.NODE_ENV || 'production'

module.exports = {
  entry: './dist/main.js',
  mode: NODE_ENV,
  target: 'node',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'main.js',
  },
  resolve: {
    symlinks: true,
    extensions: ['.ts', '.js'],
    fallback: {
      'cache-manager': false,
      "class-transformer": false,
      "class-validator": false,
      "amqp-connection-manager": false,
      "amqplib": false,
      "kafkajs": false,
      "@grpc/proto-loader": false,
      "@grpc/grpc-js": false,
      "@nestjs/websockets/socket-module": false,
      "mqtt": false,
      "ioredis": false,
      "/tmp/node_modules/aws-sdk": false,
      "aws-crt": false,
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          'ts-loader',
        ]
      }
    ]
  },
  plugins: [
  
  ],
  watch: NODE_ENV === 'dev',
  ignoreWarnings: [
    /the request of a dependency is an expression/,
  ],
  watchOptions: {
    followSymlinks: true,
  },
}
