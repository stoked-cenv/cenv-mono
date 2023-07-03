<p align="center">
<a href="http://stokedconsulting.com/" target="blank">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./sc-logo.white.png">
  <img width="200" alt="STOKED" src="./sc-logo.png">
</picture>
</a>
</p>

## cenv

  <p align="center">A well considered monorepo cli and <a href="http://nodejs.org" target="_blank">Node.js</a> library for assisting with application and infrastructure configuration management.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@stoked-cenv/cenv-mono.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/stoked-cenv/cenv-mono.svg" alt="Package License" /></a>
<a href="https://circleci.com/gh/stoked-cenv/cenv-mono" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/stoked-cenv/cenv-mono?branch=main" target="_blank"><img src="https://coveralls.io/repos/github/stoked-cenv/cenv-mono/badge.svg?branch=main#9" alt="Coverage" /></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/stoked-cenv/backers/badge.svg)](https://opencollective.com/stoked-cenv#backer)
  [![Sponsors on Open Collective](https://opencollective.com/stoked-cenv/sponsors/badge.svg)](https://opencollective.com/stoked-cenv#sponsor)-->

###  overview

Cenv inspects your packages and looks for specific conventions to identify `cenv modules` within each package. There are currently 3 different types of cenv modules, PARAMS, DOCKER, and STACK. A package must have at least one cenv module in order to take advantage of the cenv tool.

The params module is backed by AWS AppConfig and AWS Parameter store and provides a mechanism for application parameter configuration and management. The docker provides a mechanism to create an AWS ECR repository for the package containers and build and push the packages containers to the repo. Finally, the stack module uses AWS Cdk to deploy cloudformation stacks representing the infrastructure and applications contained in the packages.

### packages

This monorepo contains 4 packages which will be explained here. The packages are cli, lib, params, and ui. 

The cli package contains the code for the end user command line interface tool. 

The lib package contains the library code that can be consumed by external libraries to manage cenv parameters in their application stacks.

This params package contains the lambda code used to materialize parameters into their final state in AWS AppConfig.

The ui package contains the ui code for the cli built on https://github.com/chjj/blessed.

### support

Call your congressperson. When that doesn't work contact [Brian Stoker](mailto:b@stokedconsulting.com).

### license

[MIT Licensed](https://opensource.org/license/mit/)
