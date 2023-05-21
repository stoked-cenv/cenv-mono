FROM --platform=linux/x86_64 docker.io/alleles/stoked-cenv-base:latest as ec_cenv-lib

WORKDIR /app
COPY  . ../../
RUN yarn install
RUN yarn global add lerna
RUN yarn global add rimraf
RUN yarn global add typescript
WORKDIR /app/packages/cenv-lib
COPY package.json package.json
WORKDIR /app/
RUN yarn install
WORKDIR /app/packages/cenv-lib
COPY  . .
RUN yarn run build

