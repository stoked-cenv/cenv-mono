import {join} from 'path';
import { writeFileSync } from 'fs';
import * as util from "util";

export class Fixup {
  static tsPackages = ['lib', 'ui', 'cdk', 'cli'];
  static allPackages = [...Fixup.tsPackages, 'cli-select'];
  static examplePackages = ['api', 'globals', 'spa'];
  static exampleRoot = 'example/packages';
  static distRoot = 'dist';
  static packageRoot = 'packages';

  static loadMeta(path: string) {
    return { path, meta: require(path) };
  }

  static loadMetas(root: string, packageDirs: string[]) {
    const metas: Record<string, any> = {};
    for (const dir of packageDirs) {
      const metaObj = this.loadMeta(join(process.cwd(), root, dir, 'package.json'));
      metas[metaObj.meta.name] = metaObj;
    }
    return metas
  }

  static updateDist(metas: Record<string, { meta: any, path: string }>) {
    for (const name in metas) {
      console.log('fixing dist: ', name, metas[name].path);
      if ( metas[name].meta.bin) {
        for (const key in metas[name].meta.bin) {
          metas[name].meta.bin[key] = metas[name].meta.bin[key].replace('ts-', '');
        }
      }
      metas[name].meta.main = metas[name].meta.main.replace('.ts', '.js');
      writeFileSync(metas[name].path, JSON.stringify(metas[name].meta, null, 2));
    }
  }

  static updateDepType(metas: Record<string, any>, depType: Record<string, string>) {
    const sortedDepType: Record<string, string> = {};
    if (depType) {
      Object.keys(depType).sort().map((dep) => {
        if (metas[dep]) {
          depType[dep] = `^${metas[dep].meta.version}`;
        }
        sortedDepType[dep] = depType[dep];
      })
    }
    return sortedDepType;
  }

  static updateDeps(metas: Record<string, any>, fixupMetas?: Record<string, any>) {
    const metasToFix = fixupMetas ? fixupMetas : metas;
    for (const name in metasToFix) {
      console.log('fixing deps: ', name);
      if (metasToFix[name].meta?.peerDependencies) {
        metasToFix[name].meta.peerDependencies = this.updateDepType(metas, metasToFix[name].meta.peerDependencies);
      }
      if (metasToFix[name].meta?.dependencies) {
        metasToFix[name].meta.dependencies = this.updateDepType(metas, metasToFix[name].meta.dependencies);
      }
      if (metasToFix[name].meta?.devDependencies) {
        metasToFix[name].meta.devDependencies = this.updateDepType(metas, metasToFix[name].meta.devDependencies);
      }
      writeFileSync(metasToFix[name].path, JSON.stringify(metasToFix[name].meta, null, 2));
    }
  }
}
