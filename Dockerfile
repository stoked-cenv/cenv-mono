#dockerfile for lerna in root of monorepo
# https://stackoverflow.com/questions/68630526/lib64-ld-linux-x86-64-so-2-no-such-file-or-directory-error
FROM --platform=linux/x86_64 node:18 as base

WORKDIR /app
COPY  . .
RUN yarn install
COPY ./lerna.json ./
COPY tsconfig.base.json.old ./
RUN yarn global add lerna
