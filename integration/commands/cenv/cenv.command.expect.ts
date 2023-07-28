import { join } from 'path';

export type ExpectedParam =
  | Record<'version', boolean>
  | Record<'help', boolean>

const [firstArg] = process.argv;
// overwrite the second arg to make commander happy

const secondArg = join(__dirname, '../../../packages/cli/src/main.ts');
console.log(firstArg, secondArg)
export function setArgv(...args: string[]) {

  process.argv = [firstArg, secondArg, ...args];
}
