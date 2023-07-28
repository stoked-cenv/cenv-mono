import { Command, CommandRunner, Option } from 'nest-commander';
import { CenvLog, Package, BaseCommandOptions } from '@stoked-cenv/lib';
import {BaseCommand} from './base.command'


interface BasicCommandOptions extends BaseCommandOptions {
  string?: string;
  boolean?: boolean;
  number?: number;
}

@Command({
           name: 'basic',
           description: 'A parameter parse'
})
export class BasicCommand extends BaseCommand {
  constructor(private readonly cenvLog: CenvLog) {
    super();
  }

  async runCommand(passedParam: string[], options: BasicCommandOptions, packages: Package[]): Promise<void> {
    if (options?.boolean !== undefined && options?.boolean !== null) {
      this.runWithBoolean(passedParam, options.boolean);
    } else if (options?.number) {
      this.runWithNumber(passedParam, options.number);
    } else if (options?.string) {
      this.runWithString(passedParam, options.string);
    } else {
      this.runWithNone(passedParam);
    }
  }

  @Option({
    flags: '-n, --number [number]',
    description: 'A basic number parser',
  })
  parseNumber(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '-s, --string [string]',
    description: 'A string return',
  })
  parseString(val: string): string {
    return val;
  }

  @Option({
    flags: '-b, --boolean [boolean]',
    description: 'A boolean parser',
  })
  parseBoolean(val: string): boolean {
    return JSON.parse(val);
  }

  runWithString(param: string[], option: string): void {
    this.cenvLog.infoLog({ param, string: option });
  }

  runWithNumber(param: string[], option: number): void {
    this.cenvLog.infoLog({ param, number: option });
  }

  runWithBoolean(param: string[], option: boolean): void {
    this.cenvLog.infoLog({ param, boolean: option });
  }

  runWithNone(param: string[]): void {
    this.cenvLog.infoLog({ param });
  }
}
