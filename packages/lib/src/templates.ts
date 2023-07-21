import path from "path";
import {Cenv} from "./cenv";
import {getMonoRoot} from "./utils";
import {CenvLog, LogLevel} from "./log";
import {existsSync, renameSync, rmSync} from "fs";

export class Template {

  static async cloneRepo(dir: string, repo: string, repoDir?: string | string[], branch?: string) {
    const dirParts = path.parse(dir);
    const containingDir = dirParts.dir;
    if (process.cwd() !== containingDir) {
      const relativePath = path.relative(process.cwd(), containingDir);
      process.chdir(relativePath);
    }
    let silent = true;
    if (CenvLog.logLevel === LogLevel.VERBOSE) {
      silent = false;
    }
    console.log(`Cloning ${repo} into ${dirParts.name}`);
    const branchFlag = branch ? `--branch ${branch}` : '';

    const tempDir = 'checkoutTemp';
    const tempPath = path.join(process.cwd(), tempDir);
    if (existsSync(tempPath)) {
      rmSync(tempPath, { recursive: true, force: true });
    }
    await Cenv.execCmd(`git clone -n --depth=1 --filter=tree:0 ${repo} checkoutTemp ${branchFlag}`, {silent});
    process.chdir(dirParts.name);
    if (typeof repoDir === "string") {
      repoDir = [repoDir];
    }
    let dirCmd = ''
    if (repoDir) {
      dirCmd = `set --no-cone ${repoDir?.join(' ')}`
    }
    await Cenv.execCmd(`git sparse-checkout ${dirCmd}`, {silent});
    await Cenv.execCmd(`git checkout`, {silent});
    await Cenv.execCmd(`rm -rf ${path.join(tempPath, '.git')}`, {silent});

    repoDir?.forEach((rDir) => {
      const repoDirLocal = path.parse(rDir).name;
      renameSync(path.join(tempPath, repoDirLocal), path.join(dir, repoDirLocal));
    });
  }

  static async newWeb() {
    getMonoRoot();
    await this.cloneRepo(path.join(getMonoRoot(), Cenv.primaryPackagePath), 'https://github.com/stoked-cenv/cenv-mono.git', ['example'], 'version/2.0.0');
  }
}
