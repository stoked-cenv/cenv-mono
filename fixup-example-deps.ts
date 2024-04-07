import { Fixup } from '@stoked-cenv/lib';

const packageMetas = Fixup.loadMetas(Fixup.packageRoot, Fixup.allPackages);

Fixup.updateDeps({ ...packageMetas}, );
