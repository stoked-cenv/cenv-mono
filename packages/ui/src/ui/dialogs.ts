import {IPackage, Package, getMonoRoot, CenvLog} from '@stoked-cenv/cenv-lib';
import path from 'path';
import blessed from 'blessed';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { Dashboard } from './dashboard';

export default class Dialogs {
  static dialogs: blessed.element[] = []

  static add(dialog) {
    dialog.show();
    if (!this.dialogs.filter(d => d === dialog)?.length) {
      this.dialogs.push(dialog);
    }
  }

  static close(dialog = undefined) {
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
        if (!Dashboard.instance?.menu.active) {
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

  static saveSuiteDialog(screen) {
    const packages = Object.values(Package.cache);
    const screenContent = '\n\n\nCreate a deployment with the following packages:\n\n' + packages.map((p: Package) => p.packageName).join(', ')
    const bg = 'gray';
    let form = undefined;

    form = blessed.form({
      parent: screen,
      shadow: false,
      left: 'center',
      top: 'center',
      width: '50%',
      height: '50%',
      style: {
        bg: bg,
        transparent: false
      },
      border: 'line',
      draggable: true,
      tags: true,
      content: screenContent
    });

    this.dialogs.push(form);

    form.key('left', function() {
      form.left -= 2;
      screen.render();
    });

    form.key('up', function() {
      form.top -= 1;
      screen.render();
    });

    form.key('right', function() {
      form.left += 2;
      screen.render();
    });

    form.key('down', function() {
      form.top += 1;
      screen.render();
    });
    form.key('C-x', function() {
      form.destroy();
    });

    form.on('submit', function(data) {
      //output.setContent(JSON.stringify(data, null, 2));
      const rootPath = getMonoRoot();
      let suites: any = {};
      const suitesPath = path.join(rootPath, 'suites.json');
      if (existsSync(suitesPath)){
        suites = readFileSync(suitesPath, 'utf-8');
        suites = JSON.parse(suites);
      }
      suites[data.deployment] = {
        packages: packages.map((p: IPackage) => p.params.name)
      };

      writeFileSync(suitesPath, JSON.stringify(suites, null, 2));
      form.destroy();
    });

    form.key('d', function() {
      form.scroll(1, true);
      screen.render();
    });

    form.key('u', function() {
      form.scroll(-1, true);
      screen.render();
    });

    const text = blessed.textbox({
      parent: form,
      mouse: true,
      keys: true,
      style: {
        bg: 'blue'
      },
      height: 1,
      width: 20,
      left: 1,
      top: 1,
      name: 'deployment'
    });

    text.on('focus', function() {
      text.readInput();
    });

    const submit = blessed.button({
      parent: form,
      mouse: true,
      keys: true,
      shrink: true,
      padding: {
        left: 1,
        right: 1
      },
      left: 29,
      top: 1,
      name: 'submit',
      content: 'create',
      style: {
        bg: 'blue',
        focus: {
          bg: 'red'
        }
      }
    });

    submit.on('press', function() {
      form.submit();
    });
  }

  static saveDump(screen, exit = false) {
    CenvLog.single.catchLog(new Error('hi'));
    const dump = {
      ts: Date.now(),
      packages: Object.values(Package.cache).map((p: Package) => {
        if (p?.params?.pkg) {
          delete p.params.pkg;
        }
        if (p?.docker?.pkg) {
          delete p.docker.pkg;
        }
        if (p?.stack?.pkg) {
          delete p.stack.pkg;
        }
      })
    }

    let form = undefined;
    let selfDestructTimer = 3000;
    let timer = undefined;
    const interval = 250;
    const baseScreenContent = "Creating a deployment status dump. \n\nThis message will self destruct in: ";
    let screenContent = baseScreenContent + (selfDestructTimer / 1000).toFixed(2);
    timer = setInterval(() => {
      screenContent = baseScreenContent + (selfDestructTimer / 1000).toFixed(2);
      form.setText(screenContent);
      selfDestructTimer -= interval;

      if (selfDestructTimer < 0){
        clearInterval(timer);
        form.submit();
        form.destroy();
      }
    }, interval)

    form = blessed.form({
      parent: screen,
      shadow: false,
      left: 'center',
      top: 'center',
      width: '50%',
      height: '50%',
      style: {
        bg: 'red',
        transparent: false
      },
      border: 'line',
      draggable: true,
      tags: true,
      content: screenContent
    });
    this.dialogs.push(form);

    form.key('C-x', function() {
      form.destroy();
    });

    form.on('submit', function(data) {
      //output.setContent(JSON.stringify(data, null, 2));
      const rootPath = getMonoRoot();
      const suitesPath = path.join(rootPath, 'dump.json');
      writeFileSync(suitesPath, JSON.stringify(dump, null, 2));
      form.destroy();
      if (exit) {
        process.exit();
      }
    });

    form.key('d', function() {
      form.scroll(1, true);
      screen.render();
    });

    form.key('u', function() {
      form.scroll(-1, true);
      screen.render();
    });
  }
}
