import path from 'path';
import { writeFileSync } from 'fs';

function fixMain(dir: string) {
  console.log('fixing: ', dir);
  const rootPath = path.join(process.cwd(), 'dist', dir);
  const pkgPath = path.join(rootPath, 'package.json');
  const pkg = require(pkgPath);
  if (pkg.bin) {
    for (const key in pkg.bin) {
      pkg.bin[key] = pkg.bin[key].replace('ts-', '');
    }
  }
  pkg.main = pkg.main.replace('.ts', '.js');
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
}
fixMain('lib');
fixMain('cli');
fixMain('ui');
fixMain('cdk');