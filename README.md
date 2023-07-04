<p align="center">
<a href="http://stokedconsulting.com/" target="blank">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/sc-logo.white.png">
  <img width="200px" alt="STOKED" src="./assets/sc-logo.png">
</picture>
</a>
</p>

## cenv

  <p align="center">A well considered cli and <a href="http://nodejs.org" target="_blank">Node.js</a> library for helping manage application, infrastructure, and configuration management.</p>
  <p align="center">
    <a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/badge/node-18.16.1-blue" alt="Node Version" /></a>
  </p>
  <!--[![Backers on Open Collective](https://opencollective.com/stoked-cenv/backers/badge.svg)](https://opencollective.com/stoked-cenv#backer)
  [![Sponsors on Open Collective](https://opencollective.com/stoked-cenv/sponsors/badge.svg)](https://opencollective.com/stoked-cenv#sponsor)-->

###  overview

Cenv inspects your packages and looks for specific conventions to identify `cenv modules` within each package. There are currently 3 different types of cenv modules, PARAMS, DOCKER, and STACK. A package must have at least one cenv module in order to take advantage of the cenv tool.

The PARAMS module leverages AWS AppConfig and AWS Parameter Store to manage application parameter configuration. The DOCKER module provides a mechanism to create an AWS ECR repository for the package containers and build and push the packages containers to the repo. Finally, the STACK module uses AWS Cdk to deploy cloudformation stacks representing the infrastructure and applications contained in the packages.

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/cenv-deploy.png" >
  <img width="800" alt="STOKED" src="./assets/cenv-deploy.png">
</picture>
</p>

### packages

This monorepo contains 3 packages which will be explained here. The packages are cli, lib, params, and ui. 

The cli package contains the code for the end user command line interface tool. 

The lib package contains the library code that can be consumed by external libraries to manage cenv parameters in their application stacks.

The ui package contains the ui code for the cli built on https://github.com/chjj/blessed.

### support

Call your congressperson. When that doesn't work contact [Brian Stoker](mailto:b@stokedconsulting.com).

### license

[MIT Licensed](https://opensource.org/license/mit/)
