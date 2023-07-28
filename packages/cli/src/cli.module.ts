import { Module } from '@nestjs/common';
import {
  AddCommand,
  BuildCommand,
  CenvCommand,
  CleanCommand,
  ConfigureCommand,
  DeployCommand,
  DestroyCommand,
  DockerCommand,
  DocsCommand,
  EnvCommand,
  ExecCommand,
  InitCommand,
  LambdaCommand,
  NewCommand,
  ParamsCommand,
  PullCommand,
  PushCommand,
  RemoveCommand,
  StatCommand,
  TestCommand,
  UICommand
} from './commands';

import { CenvLog } from '@stoked-cenv/lib';

@Module({
          providers: [
            CenvLog,
            CenvCommand,
            AddCommand,
            BuildCommand,
            CleanCommand,
            ConfigureCommand,
            DeployCommand,
            DestroyCommand,
            DockerCommand,
            DocsCommand,
            EnvCommand,
            ExecCommand,
            InitCommand,
            LambdaCommand,
            NewCommand,
            ParamsCommand,
            PullCommand,
            PushCommand,
            RemoveCommand,
            StatCommand,
            TestCommand,
            UICommand
          ],
        })
export class CliModule {}
