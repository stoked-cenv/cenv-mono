import { CommandFactory } from 'nest-commander';
import { CenvModule } from './cenv.module';

const bootstrap = async () => {
  await CommandFactory.run(CenvModule, {
    errorHandler: (err) => {
      console.log(err.message);
      process.exit(0);
    },
  });
};

bootstrap();
