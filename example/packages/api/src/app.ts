import helmet from 'helmet';
import * as nocache from 'nocache';
import {ConfigService} from '@nestjs/config';
import {NestFactory} from '@nestjs/core';
import {AppModule} from './app.module';
import {HttpExceptionFilter} from './http-exception.filter';

function checkEnvironment(configService: ConfigService) {
  const requiredEnvVars = ['PORT', 'ISSUER_BASE_URL', 'AUDIENCE', 'CLIENT_ORIGIN_URL',];

  requiredEnvVars.forEach((envVar) => {
    if (!configService.get<string>(envVar)) {
      throw Error(`Undefined environment variable: ${envVar}`);
    }
  });
}

export class Server {
  async start() {
    const app = await NestFactory.create(AppModule);

    const configService = app.get<ConfigService>(ConfigService);
    checkEnvironment(configService);

    const version = configService.get<string>('API_VERSION');
    if (version !== undefined) {
      app.setGlobalPrefix(version);
    }

    app.useGlobalFilters(new HttpExceptionFilter());

    app.use(nocache());

    app.enableCors({
                     origin: configService.get<string>('CLIENT_ORIGIN_URL'),
                     methods: ['GET'],
                     allowedHeaders: ['Authorization', 'Content-Type'],
                     maxAge: 86400,
                   });

    app.use(helmet({
                     hsts: {maxAge: 31536000}, frameguard: {action: 'deny'}, contentSecurityPolicy: {
        directives: {
          'default-src': ["'self'"], 'frame-ancestors': ["'none'"],
        },
      },
                   }),);

    const port = configService.get<string>('PORT');
    if (port === undefined) {
      throw Error('Undefined environment variable: PORT');
    }

    await app.listen(port);
  }
}

export default Server;
