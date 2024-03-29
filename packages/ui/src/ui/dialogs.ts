/// <reference types="../../types/blessed"/>
import blessed from 'blessed';
import {CenvFiles, IPackage, Package, PackageCmd} from '@stoked-cenv/lib';
import * as path from 'path';
import {existsSync, readFileSync, writeFileSync} from 'fs';
import {Dashboard} from './dashboard';

export default class Dialogs {
  static dialogs: blessed.Element[] = []

  static add(dialog: any) {
    dialog.show();
    if (!this.dialogs.filter(d => d === dialog)?.length) {
      this.dialogs.push(dialog);
    }
  }

  static close(dialog: any = undefined) {
    if (this.dialogs?.length) {
      if (dialog !== undefined) {
        const diagIndex = this.dialogs.indexOf(dialog);
        if (diagIndex > -1) {
          this.dialogs = this.dialogs.filter(d => d !== dialog)
        }
      } else {
        dialog = this.dialogs.pop();
      }
      if (dialog !== Dashboard.instance?.menu) {
        dialog.destroy();
      } else {
        if (!Dashboard.instance?.menu?.active) {
          if (this.open()) {
            this.close();
          } else {
            process.exit(0);
          }
        }
        dialog.hide();
      }
    }
  }

  static open() {
    return this.dialogs?.length
  }

  static saveSuiteDialog(screen: any) {
    const packages = Package.getPackages(true);
    const screenContent = '\n\n\nCreate a deployment with the following packages:\n\n' + packages.map((p: Package) => p.packageName).join(', ')
    const bg = 'gray';
    let form: any = undefined;

    form = blessed.Form({
                          parent: screen,
                          shadow: false,
                          left: 'center',
                          top: 'center',
                          width: '50%',
                          height: '50%',
                          style: {
                            bg: bg, transparent: false
                          },
                          border: 'line',
                          draggable: true,
                          tags: true,
                          content: screenContent
                        });

    this.dialogs.push(form);

    form.key('left', function () {
      form.left -= 2;
      screen.render();
    });

    form.key('up', function () {
      form.top -= 1;
      screen.render();
    });

    form.key('right', function () {
      form.left += 2;
      screen.render();
    });

    form.key('down', function () {
      form.top += 1;
      screen.render();
    });
    form.key('C-x', function () {
      form.destroy();
    });

    form.on('submit', function (data: any) {
      //output.setContent(JSON.stringify(data, null, 2));
      const rootPath = CenvFiles.getGuaranteedMonoRoot();
      let suites: any = {};
      const suitesPath = path.join(rootPath, 'suites.json');
      if (existsSync(suitesPath)) {
        suites = readFileSync(suitesPath, 'utf-8');
        suites = JSON.parse(suites);
      }
      suites[data.deployment] = {
        packages: packages.map((p: IPackage) => p.params?.name)
      };

      writeFileSync(suitesPath, JSON.stringify(suites, null, 2));
      form.destroy();
    });

    form.key('d', function () {
      form.scroll(1, true);
      screen.render();
    });

    form.key('u', function () {
      form.scroll(-1, true);
      screen.render();
    });

    const text = blessed.Textbox({
                                   parent: form, mouse: true, keys: true, style: {
        bg: 'blue'
      }, height: 1, width: 20, left: 1, top: 1, name: 'deployment'
                                 });

    text.on('focus', function () {
      text.readInput();
    });

    const submit = blessed.Button({
                                    parent: form, mouse: true, keys: true, shrink: true, padding: {
        left: 1, right: 1
      }, left: 29, top: 1, name: 'submit', content: 'create', style: {
        bg: 'blue', focus: {
          bg: 'red'
        }
      }
                                  });

    submit.on('press', function () {
      form.submit();
    });
  }

  static saveDump(screen: any, exit = false) {

    const fieldsToDump = ['cmd', 'stderr', 'stdout', 'vars', 'code', 'stackName', 'index', 'minout', 'uniqueId'];
    const pkgCmdToObj = (pkgCmd: PackageCmd) => {
      const obj: Record<string, any> = {};
      fieldsToDump.map(f => {
        if (pkgCmd[f]) {
          obj[f] = pkgCmd[f];
        }
      });
      return obj;
    }

    const pkgCmdsToArray = (pkg: Package) => {
      const arr: Record<string, any>[] = [];
      pkg.cmds.map((pkgCmd: PackageCmd) => {
        arr.push(pkgCmdToObj(pkgCmd));
      });
      return arr;
    }

    const dump = {
      ts: Date.now(), packages: Package.getPackages(true).map((p: Package) => {
        return {[p.packageName]: pkgCmdsToArray(p)};
        /*
        Error:(148, 18) TS2790: The operand of a 'delete' operator must be optional.
        if (p?.params?.pkg) {
          delete p.params.pkg;
        }
        if (p?.docker?.pkg) {
          delete p.docker.pkg;
        }
        if (p?.stack?.pkg) {
          delete p.stack.pkg;
        }
         */
      })
    }

    let form: any = undefined;
    let selfDestructTimer = 3000;
    let timer: NodeJS.Timer | undefined = undefined;
    const interval = 250;
    const baseScreenContent = "Creating a deployment status dump. \n\nThis message will self destruct in: ";
    let screenContent = baseScreenContent + (selfDestructTimer / 1000).toFixed(2);
    timer = setInterval(() => {
      screenContent = baseScreenContent + (selfDestructTimer / 1000).toFixed(2);
      form.setText(screenContent);
      selfDestructTimer -= interval;

      if (selfDestructTimer < 0) {
        clearInterval(timer);
        form.submit();
        form.destroy();
      }
    }, interval)

    form = blessed.Form({
                          parent: screen,
                          shadow: false,
                          left: 'center',
                          top: 'center',
                          width: '50%',
                          height: '50%',
                          style: {
                            bg: 'red', transparent: false
                          },
                          border: 'line',
                          draggable: true,
                          tags: true,
                          content: screenContent
                        });
    this.dialogs.push(form);

    form.key('C-x', function () {
      form.destroy();
    });

    form.on('submit', function (data: any) {
      //output.setContent(JSON.stringify(data, null, 2));
      const rootPath = CenvFiles.getGuaranteedMonoRoot();
      const suitesPath = path.join(rootPath, 'dump.json');
      writeFileSync(suitesPath, JSON.stringify(dump, null, 2));
      form.destroy();
      if (exit) {
        process.exit();
      }
    });

    form.key('d', function () {
      form.scroll(1, true);
      screen.render();
    });

    form.key('u', function () {
      form.scroll(-1, true);
      screen.render();
    });
  }


  static yesOrNoDialog(prompt: string, callback: (response: boolean) => void) {

    const form = blessed.Form({
                                parent: Dashboard.instance?.screen,
                                shadow: false,
                                left: 'center',
                                top: 'center',
                                width: '50%',
                                height: '50%',
                                style: {
                                  bg: 'red', transparent: false
                                },
                                border: 'line',
                                draggable: true,
                                tags: true,
                                content: prompt
                              });

    form.on('submit', function (response: any) {
      callback(response);
      form.destroy();
      Dialogs.close(form);
    });

    this.dialogs.push(form);

    const yes = blessed.Button({
                                 parent: form, mouse: true, keys: true, shrink: true, padding: {
        left: 1, right: 1
      }, left: 29, top: 1, name: 'submit', content: 'yes', style: {
        bg: 'blue', focus: {
          bg: 'red'
        }
      }
                               });
    yes.on('press', function () {
      form.submit(true);
    });

    const no = blessed.Button({
                                parent: form, mouse: true, keys: true, shrink: true, padding: {
        left: 8, right: 1
      }, left: 29, top: 2, name: 'submit', content: 'no', style: {
        bg: 'blue', focus: {
          bg: 'red'
        }
      }
                              });
    no.on('press', function () {
      form.submit(false);
    });
  }

  static setFront() {
    this.dialogs.map(d => d.setFront());
  }

  static show() {
    this.dialogs.map(d => d.show());
  }

  static hide() {
    this.dialogs.map(d => d.hide());
  }

  static render() {
    this.dialogs.map(d => d.render());
  }
}
