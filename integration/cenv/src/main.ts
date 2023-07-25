import { CommandFactory } from 'nest-commander';
import { CenvModule } from './cenv.module';

const bootstrap = async () => {
  await CommandFactory.run(CenvModule);
};

bootstrap();
