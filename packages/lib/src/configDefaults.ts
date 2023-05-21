import {join} from "path";

const app = 'cenv';
const appExt = `.${app}`

const configDefaults = {
  app: app,
  appExt: appExt,
  configurationProfile: 'config',
  environment: 'default',
};

export { configDefaults };
