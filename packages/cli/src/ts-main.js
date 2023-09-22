#! /usr/bin/env node

require('ts-node').register({ project: require('path').join(__dirname, '../tsconfig.build.json')});
require('./main.ts');