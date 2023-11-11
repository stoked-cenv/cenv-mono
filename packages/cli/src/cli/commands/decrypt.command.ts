import {Command, Option} from 'nest-commander';
import * as path from 'path';
import {
  BaseCommandOptions,
  Cenv,
  CenvFiles,
  CenvLog, crypt,
  CryptCommandOptions,
  decrypt,
  encrypt,
  getConfigVars,
  Package,
  PackageModule,
  ParamsModule,
  spawnCmd,
} from '@stoked-cenv/lib';
import {BaseCommand} from './base.command'
import {readFileSync, writeFileSync} from "fs";


@Command({
           name: 'decrypt', description: 'Decrypt data',
         })
export class DecryptCommand extends BaseCommand {

  constructor() {
    super();
  }

  @Option({
    flags: '-f, --file <string>', description: `File to decrypt`
  }) parseFile(val: string): string {
    return val;
  }

  @Option({
    flags: '-o, --output <string>', description: `Output to file`
  }) parseOutput(val: string): string {
    return val;
  }

  async runCommand(params: string[], options: CryptCommandOptions): Promise<void> {
    await crypt(params, options, decrypt);
  }
}
