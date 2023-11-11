import { Module } from '@nestjs/common';
import {
  BootstrapCommand,
  BuildCommand,
  CenvCommand,
  ConfigCommand,
  DecryptCommand,
  DeployCommand,
  DestroyCommand,
  DockerCommand,
  DocsCommand,
  EncryptCommand,
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
      BootstrapCommand,
      CenvLog,
      CenvCommand,
      BuildCommand,
      ...ConfigCommand.registerWithSubCommands(),
      DecryptCommand,
      DeployCommand,
      DestroyCommand,
      DockerCommand,
      DocsCommand,
      EncryptCommand,
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
