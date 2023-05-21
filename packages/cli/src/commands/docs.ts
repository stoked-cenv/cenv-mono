import { Command, CommandRunner, Option } from 'nest-commander';
import { HelpUI } from '@stoked-cenv/cenv-ui';
import { CenvLog } from '@stoked-cenv/cenv-lib';


interface DocsCommandOptions {
  testing?: string;
}

@Command({
  name: 'docs',
  arguments: '[command]',
  description: 'Display help UI'
})

export default class DocsCommand extends CommandRunner {
  async run(params: string[], options?: DocsCommandOptions): Promise<void> {
    try {
      new HelpUI();
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
