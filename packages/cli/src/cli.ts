import { Module } from '@nestjs/common';
import { Commands } from '@stoked-cenv/cenv-ui';
import { CenvLog } from '@stoked-cenv/cenv-lib';

const commands = Commands.list();
function getProviders() {
  const providers = [];
  commands.map(async (cmd: string[]) => {
    const command = await import(`./commands/${cmd[1]}`)
    command.meta = Reflect.getMetadata('CommandBuilder:Command:Meta', command.default);
    command.options = Reflect.getMetadata('CommandBuilder:Option:Meta', command.default);
    if (command.options) {
      CenvLog.single.catchLog(JSON.stringify(command.options, null, 2));
    }
    CenvModule.providers[cmd[1]] = command;
    providers.push(command.default);
  });
  return providers;
}

@Module({
  providers: getProviders()
})

export class CenvModule {
  static providers: any = {};
}
