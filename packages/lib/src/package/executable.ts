import { IPackageModule, PackageModule, PackageModuleType } from './module';
import { CenvLog } from '../log';

export class ExecutableModule extends PackageModule {
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
      this.pkg?.meta?.executables?.filter(e => e.installed).map(e => {
        this.pkg.status.deployed.push(this.statusLine(
          'installed',
          `executable [${e.exec}] is installed`,
          false,
        ));
      })
      this.pkg?.meta?.executables?.filter(e => !e.installed).map(e => {
        this.pkg.status.needsFix.push(this.statusLine(
          'not installed',
          `executable [${e.exec}] is not installed`,
          false,
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
    this.info('installed at', this.pkg?.meta?.executables?.toLocaleString(), 'executable')
  }

  async checkStatus() {
    this.printCheckStatusStart();
    await this.pkg.build(false, false);
    await Promise.all(this.pkg?.meta?.executables?.map(async (e) => {
      const res = await this.pkg.pkgCmd(`which ${e.exec}`,{ packageModule: this, returnOutput: true });
      if (res.code === 0) {
        e.installed = true;
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
