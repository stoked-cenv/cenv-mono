import * as path from "path";
import {Cenv} from "./cenv";
import {getMonoRoot} from "./utils";
import {CenvLog, LogLevel} from "./log";
import { existsSync, mkdirSync, renameSync, rmSync } from 'fs';
import { CenvFiles } from './file';

export class Template {

  static async cloneRepo(destinationPath: string, repo: string, repoDir?: string | string[], branch?: string) {
    if (process.cwd() !== CenvFiles.GitTempPath) {
      const relativePath = path.relative(process.cwd(), CenvFiles.GitTempPath);
      process.chdir(relativePath);
    }
    let silent = true;
    if (CenvLog.logLevel === LogLevel.VERBOSE) {
      silent = false;
    }

    const tempDir = 'checkoutTemp';
    const tempPath = path.join(process.cwd(), tempDir);
    if (existsSync(tempPath)) {
      rmSync(tempPath, { recursive: true, force: true });
    }

    /*
    https://stackoverflow.com/questions/4114887/is-it-possible-to-do-a-sparse-checkout-without-checking-out-the-whole-repository
    git clone <URL> --no-checkout <directory>
    cd <directory>
    git sparse-checkout init --cone # to fetch only root files
    git sparse-checkout set apps/my_app libs/my_lib # etc, to list sub-folders to checkout
    git checkout # or git switch
     */

    CenvLog.single.infoLog(`Cloning ${repo} into ${destinationPath}`);
    let gitPackage: any = undefined, gitDomain: string | undefined = undefined;
    if (repo.indexOf('://') !== -1) {
      gitPackage = repo.substring(repo.indexOf('://') + 3).split('/');
      gitDomain = gitPackage.shift();
      gitPackage = gitPackage.join('/')
    } else if (repo.indexOf('@') !== -1 && repo.indexOf(':') !== -1) {
      gitDomain = repo.substring(repo.indexOf('@') + 1, repo.indexOf(':'));
      gitPackage = repo.substring(repo.indexOf(':') + 1);
    } else {
      CenvLog.single.catchLog(`the repo url "${repo}" does not appear to be in https or ssh form.. so it isn't supported`);
      process.exit(772);
    }
    if (gitPackage.endsWith('.git')) {
      gitPackage.substring(0, gitPackage.length - 5)
    }
    const finalTempPath = path.join(CenvFiles.GitTempPath, gitDomain, gitPackage);
    const finalTempParts = path.parse(finalTempPath);
    if (!existsSync(finalTempParts.dir)) {
      mkdirSync(finalTempParts.dir, {recursive: true})
    }

    // remove the final destination folder
    await Cenv.execCmd(`rm -rf ${finalTempPath}`, {silent});

    const branchFlag = branch ? `--branch ${branch} ` : '';
    if (typeof repoDir === "string") {
      repoDir = [repoDir];
    }

    await Cenv.execCmd(`git clone ${branchFlag}${repo} --no-checkout ${finalTempPath}`, {silent});
    process.chdir(path.join(gitDomain, gitPackage));
    await Cenv.execCmd(`git sparse-checkout init --cone`, {silent});
    await Cenv.execCmd(`git sparse-checkout set ${repoDir.join(' ')}`, {silent});
    await Cenv.execCmd(`git checkout`, {silent});

    repoDir?.forEach((rDir) => {
      const repoDirLocal = path.parse(rDir).name;
      renameSync(path.join(finalTempPath, rDir), path.join(destinationPath, repoDirLocal));
    });
  }

  static async newWeb() {
    getMonoRoot();
    await this.cloneRepo(CenvFiles.PRIMARY_PACKAGE_PATH, 'https://github.com/stoked-cenv/cenv-mono.git', ['example/packages/api', 'example/packages/spa'], 'version/2.0.0');
  }
}