import { Module } from '@nestjs/common';
import CenvCommand from '../../../packages/cli/src/commands/cenv';
import ExecCommand from '../../../packages/cli/src/commands/exec';
import { LogService } from '../../common/log.service';

@Module({
  providers: [CenvCommand, ExecCommand, LogService],
})
export class CenvModule {

}
