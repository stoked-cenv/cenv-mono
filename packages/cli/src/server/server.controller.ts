import { Controller, Get, Inject } from '@nestjs/common';
import { ServerService } from './services/server.service';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

@Controller()
export class ServerController {
  constructor(
    private readonly appService: ServerService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  @Get('/')
  getHello(): string {
    this.logger.info('Calling getHello()', { controller: ServerController.name });

    return this.appService.getHello();
  }
}