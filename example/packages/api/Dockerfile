
# Dockerfile

#
# 🧑‍💻 Development
#
FROM --platform=linux/amd64 node:18-alpine as dev
# add the missing shared libraries from alpine base image
RUN apk add --no-cache libc6-compat

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PATH}:${PNPM_HOME}"
RUN npx npm i -g pnpm

# Create app folder
WORKDIR /app

# Set to dev environment
ENV NODE_ENV dev

COPY . .
COPY ./packages/globals ./packages/globals

## Copy source code into app folder
COPY --chown=node:node ./packages/api ./packages/api

## Install dependencies
RUN pnpm i --frozen-lockfile --ignore-scripts

## Set Docker as a non-root user
USER node

## 🏡 Production Build
##
FROM --platform=linux/amd64 node:18-alpine as build

WORKDIR /app

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PATH}:${PNPM_HOME}"
RUN npx npm i -g pnpm

## Set to production environment
ENV NODE_ENV production

## In order to run `pnpm build` we need access to the Nest CLI.
## Nest CLI is a dev dependency.
COPY --chown=node:node --from=dev /app/node_modules ./node_modules
COPY --chown=node:node --from=dev /app/packages/globals ./packages/globals
COPY --chown=node:node --from=dev /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --chown=node:node --from=dev /app/pnpm-lock.yaml ./pnpm-lock.yaml

## Copy source code
COPY --chown=node:node ./packages/api ./packages/api

## Generate the production build. The build script runs "nest build" to compile the application.
WORKDIR /app/packages/api
RUN pnpm run build

## Install only the production dependencies and clean cache to optimize image size.
RUN pnpm i --frozen-lockfile --production
RUN pnpm prune --prod

## Set Docker as a non-root user
USER node


## 🚀 Production Server
##
FROM --platform=linux/amd64 node:18-alpine as prod

WORKDIR /app
RUN apk add --no-cache libc6-compat

## Set to production environment
ENV NODE_ENV production

## allow non root to open 80
RUN apk add --no-cache libcap && setcap 'cap_net_bind_service=+ep' `readlink -f \`which node\``

## Copy only the necessary files
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/packages/api/dist ./packages/api/dist
COPY --chown=node:node --from=build /app/packages/globals ./packages/globals
COPY --chown=node:node --from=build /app/packages/api/node_modules ./packages/api/node_modules

## Set Docker as non-root user
USER node
WORKDIR /app/packages/api
CMD ["node", "dist/main.js"]
