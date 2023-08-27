import {PackageModule, PackageModuleType} from './module';
import {existsSync} from "fs";
import {execCmd} from "../proc";
import {Package, TPackageMeta} from "./package";
import { CenvLog } from '../log';

export class ExecutableModule extends PackageModule {
  installPath?: string;
  installed = false;

  constructor(pkg: Package, path: string, meta: TPackageMeta) {
    super(pkg, path, meta, PackageModuleType.EXEC);
  }

  get exec() {
    if (!this.pkg?.meta?.metas || !this.pkg?.meta?.metas[this.path]?.bin) {
      return 'exec_unknown';
    }
    const execs = Object.keys(this.pkg.meta.metas[this.path].bin);
    if (!execs?.length) {
      return 'exec_unknown';
    }
    return execs[0]
  }

  get anythingDeployed(): boolean {
    return !!this.installed;
  }

  get moduleStrings(): string[] {
    const items = super.moduleBaseStrings;
    if (this.installed) {
      items.push(`executable: [${this.exec}] installed`);
    } else {
      items.push(`executable: [${this.exec}] not installed`);
    }
    return items;
  }

  static fromModule(module: PackageModule) {
    return new ExecutableModule(module.pkg, module.path, module.meta);
  }

  upToDate(): boolean {
    return this.installed;
  }

  getDetails() {
    if (this.upToDate()) {
      this.pkg.status.deployed.push(this.statusLine('installed', `executable [${this.exec}] is installed`, false,));
      return;
    } else {
      this.pkg.status.needsFix.push(this.statusLine('not installed', `executable [${this.exec}] is not installed`, true,));
    }
  }

  reset() {
    this.installed = false;
    this.installPath = undefined;
    this.checked = false;
  }

  statusIssues() {
    this.verbose(this.statusLine('not installed', `executable [${this.exec}] is not installed`, false,));
  }

  printCheckStatusComplete(): void {
    this.getDetails();
    if (this.installPath) {
      this.info('installed at', this.installPath, 'executable')
    } else {
      this.info('not installed', 'executable')
    }
  }

  async checkStatus() {
    this.printCheckStatusStart();
    const execWhich = `which ${this.exec}`;
    const execPath = await execCmd(execWhich, {silent: true});
    if (execPath?.length && existsSync(execPath)) {
      this.installPath = execPath;
      this.installed = true;
    }

    this.printCheckStatusComplete();
    this.checked = true;
  }

  async link() {
    //await this.pkg.pkgCmd(`npm unlink ${this.name} -g`,{ packageModule: this });
    await this.pkg.pkgCmd(`npm link`, {packageModule: this});
  }
}
