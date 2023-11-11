import {Command, Option} from 'nest-commander';
import * as path from 'path';
import {
  BaseCommandOptions,
  Cenv,
  CenvFiles,
  CenvLog,
  crypt,
  CryptCommandOptions,
  decrypt,
  encrypt, execCmd,
  getConfigVars,
  Package,
  PackageModule,
  ParamsModule,
  spawnCmd,
} from '@stoked-cenv/lib';
import {BaseCommand} from './base.command'
import {readFileSync, writeFileSync} from "fs";


@Command({
           name: 'bootstrap', description: 'Create the cdk bootstrap stack',
         })
export class BootstrapCommand extends BaseCommand {

  constructor() {
    super();
  }

  async runCommand(params: string[], options: CryptCommandOptions): Promise<void> {
    await execCmd(`cdk bootstrap aws://${process.env.CDK_DEFAULT_ACCOUNT}/${process.env.CDK_DEFAULT_REGION}`, { silent: false });
  }
}
