import { Fixup } from '@stoked-cenv/lib';
import { join } from 'path';

const workspaceMetas = Fixup.loadMetas(Fixup.packageRoot, Fixup.allPackages);
const metaObj = Fixup.loadMeta(join(process.cwd(), 'package.json'));
workspaceMetas[metaObj.meta.name] = metaObj;
Fixup.updateDeps(workspaceMetas);
