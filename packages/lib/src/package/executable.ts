import { IPackageModule, PackageModule, PackageModuleType } from './module';
import { CenvLog } from '../log';
import { existsSync } from "fs";
import { execCmd } from "../utils";

export class ExecutableModule extends PackageModule {
  installPath: string;
  installed: boolean = undefined;
  
  constructor(module: IPackageModule) {
    super(module, PackageModuleType.EXEC);
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

  upToDate(): boolean {
    return this.installed;
  }

  getDetails() {
    if (this.upToDate()) {
          this.pkg.status.deployed.push(this.statusLine(
            'installed',
            `executable [${this.exec}] is installed`,
            false,
          ));
      return;
    } else {
      this.pkg?.meta?.executables?.filter(e => !e.installed).map(e => {
        this.pkg.status.needsFix.push(this.statusLine(
          'not installed',
          `executable [${this.exec}] is not installed`,
          true,
        ));
      })
    }
  }

  get anythingDeployed(): boolean {
    return !!this.installed;
  }

  reset() {
    this.installed = undefined;
    this.installPath = undefined;
    this.checked = false;
  }

  statusIssues() {
      this.verbose(this.statusLine(
        'not installed',
        `executable [${this.exec}] is not installed`,
        false,
      ));
  }

  printCheckStatusComplete(): void {
    this.getDetails();
    this.info('installed at', this.installPath, 'executable')
  }

  async checkStatus() {
    this.printCheckStatusStart();
    const execWhich = `which ${this.exec}`;
    const cmd = await this.pkg.createCmd(execWhich);
    const execPath = await execCmd('./', execWhich);
    if (execPath?.length && existsSync(execPath))
    {
      this.installPath = execPath;
      this.installed = true;
    }
    cmd.result(0);

    this.printCheckStatusComplete();
    this.checked = true;
  }

  static fromModule(module: PackageModule) {
    return new ExecutableModule(module);
  }

  get moduleStrings(): string[] {
    const items = super.moduleBaseStrings;
    this.pkg?.meta?.executables?.filter(e => e.installed).map(e => {
      items.push(`executable: [${e.exec}] installed`);
    })
    this.pkg?.meta?.executables?.filter(e => !e.installed).map(e => {
      items.push(`executable: [${e.exec}] not installed`);
    })
    return items;
  }

  async link() {
    //await this.pkg.pkgCmd(`npm unlink ${this.name} -g`,{ packageModule: this });
    await this.pkg.pkgCmd(`npm link`,{ packageModule: this });
  }
}
