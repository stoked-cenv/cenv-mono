import { IPackageModule, PackageModule, PackageModuleType } from './module';
import { CenvLog } from '../log';
import { existsSync } from "fs";

export class ExecutableModule extends PackageModule {
  installPath: string;

  constructor(module: IPackageModule) {
    super(module, PackageModuleType.EXEC);
  }


  upToDate(): boolean {
    return !!this.pkg?.meta?.executables?.filter(e => !e.installed).length;
  }

  getDetails() {
    if (this.upToDate()) {
        this.pkg?.meta?.executables?.map(e => {
          this.pkg.status.deployed.push(this.statusLine(
            'installed',
            `executable [${e.exec}] is installed`,
            false,
          ));
        })
      return;
    } else {
      this.pkg?.meta?.executables?.filter(e => !e.installed).map(e => {
        this.pkg.status.needsFix.push(this.statusLine(
          'not installed',
          `executable [${e.exec}] is not installed`,
          true,
        ));
      })
    }
  }

  get anythingDeployed(): boolean {
    return !!this.pkg?.meta?.executables?.filter(e => e.installed).length;
  }

  reset() {
    this.pkg?.meta?.executables?.map(e => e.installed = false);
    this.checked = false;
  }

  statusIssues() {
    this.pkg?.meta?.executables?.filter(e => !e.installed).map(e => {
      this.verbose(this.statusLine(
        'not installed',
        `executable [${e.exec}] is not installed`,
        false,
      ));
    });
  }

  printCheckStatusComplete(): void {
    this.getDetails();
    this.info('installed at', this.installPath, 'executable')
  }

  async checkStatus() {
    this.printCheckStatusStart();
    await Promise.all(this.pkg?.meta?.executables?.map(async (e) => {
      const res = await this.pkg.pkgCmd(`which ${e.exec}`,{ packageModule: this, returnOutput: true });
      if (res.code === 0 && res.stdout?.length && existsSync(res.stdout)) {
        e.installed = true;
        this.installPath = res.stdout;
      }
    }));
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
    await this.pkg.pkgCmd(`npm unlink ${this.name} -g`,{ packageModule: this });
    await this.pkg.pkgCmd(`nx run ${this.name}:build`,{ packageModule: this });
    await this.pkg.pkgCmd(`npm link`,{ packageModule: this });
  }
}
