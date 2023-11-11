import { Fixup } from '@stoked-cenv/lib';
import { join } from 'path';

const workspaceMetas = Fixup.loadMetas(Fixup.packageRoot, Fixup.allPackages);;
workspaceMetas.loadMeta(join(process.cwd(), 'package.json'));
workspaceMetas.loadMeta(join(process.cwd(), 'packages/lib/params/package.json'));
Fixup.updateDeps(workspaceMetas);
