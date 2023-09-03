import { Module } from '@nestjs/common';
import {
  BuildCommand,
  CenvCommand,
  ConfigCommand,
  DeployCommand,
  DestroyCommand,
  DockerCommand,
  DocsCommand,
  EnvCommand,
  ExecCommand,
  LambdaCommand,
  NewCommand,
  ParamsCommand,
  StatCommand,
  TestCommand,
  UICommand,
  StackCommand,
} from './commands';
import { CenvLog } from '@stoked-cenv/lib';

@Module({
  providers:
    [
      CenvLog,
      CenvCommand,
      BuildCommand,
      ...ConfigCommand.registerWithSubCommands(),
      DeployCommand,
      DestroyCommand,
      DockerCommand,
      DocsCommand,
      EnvCommand,
      ExecCommand,
      LambdaCommand,
      NewCommand,
      ...ParamsCommand.registerWithSubCommands(),
      StatCommand,
      ...StackCommand.registerWithSubCommands(),
      TestCommand,
      UICommand
    ],
})
export class CliModule {
}
