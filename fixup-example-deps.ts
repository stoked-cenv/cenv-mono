import { Fixup } from '@stoked-cenv/lib';

const exampleMetas = Fixup.loadMetas(Fixup.exampleRoot, Fixup.examplePackages);
const packageMetas = Fixup.loadMetas(Fixup.packageRoot, Fixup.allPackages);

Fixup.updateDeps({ ...exampleMetas, ...packageMetas}, exampleMetas);