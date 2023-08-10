import Fixup from './fixup';

const exampleMetas = Fixup.loadMetas(Fixup.exampleRoot, Fixup.examplePackages);
const packageMetas = Fixup.loadMetas(Fixup.packageRoot, Fixup.packages);

Fixup.updateDeps({ ...exampleMetas, ...packageMetas}, exampleMetas);