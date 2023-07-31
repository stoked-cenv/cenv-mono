import { Module } from '@nestjs/common';
import {
  BuildCommand,
  CenvCommand,
  CleanCommand,
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
} from './commands';
import { CenvLog } from '@stoked-cenv/lib';

@Module({
          providers: [
            CenvLog,
            CenvCommand,
            BuildCommand,
            CleanCommand,
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
            TestCommand,
            UICommand
        ]
})
export class CliModule {}
