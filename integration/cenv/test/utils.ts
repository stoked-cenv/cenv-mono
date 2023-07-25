import { join } from 'path';

export type ExpectedParam =
  | Record<'version', boolean>
  | Record<'help', boolean>

const [firstArg] = process.argv;
// overwrite the second arg to make commander happy
console.log('__dirname', __dirname)
const secondArg = join(__dirname, 'basic.command.js');

export function setArgv(...args: string[]) {
  process.argv = [firstArg, secondArg, 'cenv', ...args];
}
