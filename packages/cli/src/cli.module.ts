import { Module } from '@nestjs/common';
import AddParamsCommand from './commands/add';
import BuildCommand from './commands/build';
//import BumpCommand from './commands/bump';
import CenvCommand from './commands/cenv';
import CleanCommand from './commands/clean';
import ConfigureCommand from './commands/configure';
import DeployCommand from './commands/deploy';
import DestroyCommand from './commands/destroy';
import DockerCommand from './commands/docker';
import DocsCommand from './commands/docs';
import EnvCommand from './commands/env';
import ExecCommand from './commands/exec';
import InitCommand from './commands/init';
import LambdaCommand from './commands/lambda';
import NewCommand from './commands/new';
import ParamsCommand from './commands/params';
import PullCommand from './commands/pull';
import PushCommand from './commands/push';
import RemoveCommand from './commands/rm';
import StatCommand from './commands/stat';
import TestCommand from './commands/test';
import UICommand from './commands/ui';

import { LogService } from './common/log.service';

@Module({
          providers: [
            AddParamsCommand,
            BuildCommand,
            LogService,
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
            UICommand,
          ],
        })
export class BasicModule {}
