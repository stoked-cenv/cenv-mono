import {blessed, contrib} from './blessed';

import colors from 'colors/safe';
import {Dashboard} from './dashboard';
import {CenvPanel} from './panel';
import {CenvLog, Cmd, PackageCmd} from '@stoked-cenv/lib';

blessed.text.prototype.name = '';
blessed.list.prototype.name = ''
blessed.box.prototype.name = '';
export default class CmdPanel extends CenvPanel {
  cmdList: blessed.list;
  stdout: blessed.text;
  stderr: blessed.box;
  selectedCmdIndex = -1;
  debugStr: any;

  constructor(dashboard: Dashboard) {
    super(dashboard);
  }

  init() {
    try {
      this.cmdList = this.addGridWidget(blessed.list, {
        keys: true, mouse: true, interactive: true, style: {
          text: 'red', selected: {
            bold: true, fg: [24, 242, 24], bg: 'black',
          }, border: {fg: 'grey'}, label: {side: 'left', fg: 'gray'}, focus: {fg: 'red'}
        }, template: {lines: true}, selectedInverse: false, scrollable: true, scrollbar: {
          ch: ' ', inverse: true,
        }, hidden: false
      }, [0, 2, 1, 3], true,);
      this.cmdList.name = 'tasks';

      this.stdout = this.addGridWidget(blessed.text, {
        vi: true, fg: 'white', label: 'stdout', tags: true, keys: true, mouse: true, scrollable: true, scrollbar: {
          ch: ' ', inverse: true,
        }, style: {
          fg: 'white', bg: 'black', border: {fg: 'gray'}, label: {fg: 'gray'}
        }, autoScroll: false, padding: {left: 1, right: 1, top: 0, bottom: 0}, hidden: true
      }, [1, 2, 3, 3], true,);
      this.stdout.name = 'stdout'

      this.stdout.on('wheeldown',  () => {
        const index = this.focusPool.indexOf(this.stdout);
        this.setFocus(index);
        this.stdout.scroll((this.stdout.height / 2) | 0 || 1);
        this.stdout.screen.render();
      });

      this.stdout.on('wheelup', () => {
        const index = this.focusPool.indexOf(this.stdout);
        this.setFocus(index);
        this.stdout.scroll(-((this.stdout.height / 2) | 0) || -1);
        this.stderr.screen.render();
      });

      this.stdout.on('click', () => {
        const index = this.focusPool?.indexOf(this.stdout);
        if (index !== undefined) {
          this.setFocus(index);
        }
      });

      this.stderr = this.addGridWidget(blessed.box, {
        fg: 'brightRed', label: 'stderr', keys: true, mouse: true, scrollable: true, scrollbar: {
          ch: ' ', inverse: true,
        }, style: {
          fg: 'brightRed', bg: 'black', border: {fg: 'gray'}, label: {fg: 'gray'}
        }, autoScroll: false, padding: {left: 1, right: 1, top: 0, bottom: 0}
      }, [4, 2, 2, 3], true,);
      this.stderr.name = 'stderr'
      this.stderr.setLabel(CenvLog.colors.info(`stderr`));

      this.stderr.on('click', () => {
        const index = this.focusPool.indexOf(this.stderr);
        this.setFocus(index);
      });

      this.stderr.on('wheeldown', () => {
        const index = this.focusPool.indexOf(this.stderr);
        this.setFocus(index);
        this.stderr.scroll((this.stderr.height / 2) | 0 || 1);
        this.stderr.screen.render();
      });

      this.stderr.on('wheelup', () => {
        const index = this.focusPool.indexOf(this.stderr);
        this.setFocus(index);
        this.stderr.scroll(-((this.stderr.height / 2) | 0) || -1);
        this.stderr.screen.render();
      });

      this.cmdList.on('click', ()=> {
        const index = this.focusPool.indexOf(this.cmdList);
        this.setFocus(index);
      });


      const cdkOutput = (stdout?: string) => {

        if (!stdout) {
          return;
        }
        Dashboard.debug('stdout', stdout)

        const regex = /(.*?) \| {3}([0-9]+) \| ([0-9]{1,2}\:[0-9]{2}\:[0-9]{2} [(?>AM)|(?>PM)]{2}) \| ([A-Z_\_]*) *\| ([a-z_A-Z_\:3]*) *\| ([a-z_A-Z_0-9_\:\/-]*) \((.*)\)]? ?(.*)?.\n/gm;

        // Alternative syntax using RegExp constructor
        // const regex = new RegExp('(.*?) \\|   ([0-9]+) \\| ([0-9]{1,2}\\:[0-9]{2}\\:[0-9]{2} [(?>AM)|(?>PM)]{2}) \\| ([A-Z_\\_]*) *\\| ([a-z_A-Z_\\:3]*) *\\| ([a-z_A-Z_0-9_\\:\\/-]*) \\((.*)\\)]? ?(.*)?.\\n', 'gm')

        let m;

        while ((m = regex.exec(stdout)) !== null) {
          // This is necessary to avoid infinite loops with zero-width matches
          if (m.index === regex.lastIndex) {
            regex.lastIndex++;
          }

          // The result can be accessed through the `m`-variable.
          m.forEach((match, groupIndex) => {
            Dashboard.debug(`Found match, group ${groupIndex}: ${match}`);
          });
        }

        return stdout;
      }
      this.cmdList.on('select item', (item: any, index: number) => {
        if (this.selectedCmdIndex === index) {
          return;
        }

        const cmd = this.getPkgCmd(index);
        if (!cmd) {
          return;
        }
        this.stderr.setContent(cmd.stderr);

        const isCdk = cmd.cmd.startsWith('cdk');
        if (isCdk && Dashboard.cdkToggle) {
          Dashboard.debug('cdkToggle');
          this.stdout.setContent(cdkOutput(cmd.stdout));
        } else {
          this.stdout.setContent(cmd.stdout);
        }

        this.selectedCmdIndex = index;
        this.stderr.setScrollPerc(0);
        this.stdout.setScrollPerc(0);
      });
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
    return;
  }

  getCmdText(cmdIndex: number, cmd: Cmd) {
    const selected = this.cmdList.selected === cmdIndex;
    let color = '';
    if (cmd.code === undefined) {
      color = 'green';
    } else if (cmd.code === 0) {
      //Dashboard.debug('code 0')
      color = 'gray';
    } else if (cmd.code) {
      //Dashboard.debug('code != undefined || 0')
      color = 'red';
    }
    const colorFunc = colors[color as keyof typeof colors];
    if (colorFunc !== false && colorFunc !== true) {
      return colorFunc(cmd.cmd!);
    }
    return cmd.cmd;
  }

  updateCmds() {
    try {

      if (this.getPkg().activeCmdIndex > -1) {
        this.selectedCmdIndex = this.getPkg().activeCmdIndex;
      }

      const cmds = this.getPkgCmds();
      const cmdText = cmds.map((c: PackageCmd, i: number) => {
        return this.getCmdText(i, c) as string;
      });

      if (cmdText && cmdText.length) {
        this.cmdList.setItems(cmdText);
        this.cmdList?.children?.map((c: any, i: number) => {
          if (!c.hasClicker) {
            c.on('click', () => {
              this.getPkg().activeCmdIndex = i;
              const index = this.focusPool.indexOf(this.cmdList);
              this.dashboard.setFocusIndex(index);
            });
            c.hasClicker = true;
          }
        });
        if (this.getPkg().activeCmdIndex !== -1) {
          this.cmdList.select(this.getPkg().activeCmdIndex);
        }
      }
      if (this.selectedCmdIndex > this.cmdList.children.length - 1 && this.getPkg().activeCmdIndex === -1) {
        this.selectedCmdIndex = this.cmdList.children.length - 1;
        this.cmdList.select(this.selectedCmdIndex);
        this.selectCmdOutput(this.selectedCmdIndex);
      }
    } catch (e) {
      this.dashboard.debugStr = 'caught error';
    }
  }

  setFocus(focusIndex: number) {
    this.dashboard.setFocusIndex(focusIndex);
  }

  updatePackage() {
    this.updateCmds();

    const pkgCmds = this.getPkgCmds();
    this.stderr.setContent('');
    this.cmdList.setItems([]);
    if (!pkgCmds) {
      return;
    }
    const pkg = this.getPkg();
    if (pkg?.modules?.length) {
      this.cmdList.setLabel(`tasks`)
    } else {
      this.cmdList.removeLabel();
    }
    if (this.getPkg().activeCmdIndex !== -1) {
      this.selectedCmdIndex = this.getPkg().activeCmdIndex;
    } else if (pkgCmds.length - 1 > -1) {
      this.selectedCmdIndex = pkgCmds.length - 1;
      this.getPkg().activeCmdIndex = this.selectedCmdIndex;
    }

    if (this.selectedCmdIndex !== -1) {
      this.cmdList.select(this.selectedCmdIndex);
      this.selectCmdOutput(this.selectedCmdIndex);
    }
  }

  createCmd(cmd: string): any {
    return {
      cmd: colors.green(cmd), vars: {}, code: undefined, stderr: '', stdout: '',
    };
  }

  processCmd(cmdIndex: number) {
    const pkgCmds = this.getPkgCmds();
    if (cmdIndex === -1) {
      if (!pkgCmds.length) {
        return -1;
      }
      cmdIndex = this.cmdList.items.length - 1;
    }

    if (pkgCmds.length !== this.cmdList?.items?.length) {
      this.updateCmds();
    }

    if (this.selectedCmdIndex === undefined) {
      this.selectedCmdIndex = this.cmdList?.items?.length - 1;
    }
    return cmdIndex;
  }

  out(stackName: string, message: string) {
    this.stdoutLog(stackName, message);
  }

  err(stackName: string, message: string) {
    this.stderrLog(stackName, message);
  }

  exitCmd(cmdIndex: number) {
    this.cmdList.items[cmdIndex] = this.getCmdText(cmdIndex, this.getPkgCmds()[cmdIndex],);
  }

  isCmdActive(cmdIndex: number) {
    return cmdIndex === this.selectedCmdIndex;
  }

  selectCmdOutput(cmdIndex: number) {
    const pkgCmds = this.getPkgCmds();
    cmdIndex = this.processCmd(cmdIndex);

    //function removeTrailing(text: string) {
    //  return text.endsWith('\n') ? text.substring(0, text.length - 1) : text;
    //}
    if (cmdIndex === -1) {
      return;
    }
    if (pkgCmds[cmdIndex]) {
      if (pkgCmds[cmdIndex].stderr) {
        this.stderr.setContent(pkgCmds[cmdIndex].stderr);
      } else {
        //this.stderr.setContent('');
      }

      if (pkgCmds[cmdIndex].stdout) {
        this.stdout.setContent(pkgCmds[cmdIndex].stdout);
      } else {
        //this.stdout.setContent(' - ');
      }
    }
  }

  set(left: number, width: number, top: number, height: number) {
    this.cmdList.top = top;

    const cmdListAdditionalHeight = this.cmdList.hidden ? 0 : this.cmdList.height;
    this.stdout.top = !this.getPkg()?.isGlobal ? top + cmdListAdditionalHeight : top;
    const cmds = this.getPkgCmds();
    const multiplier = this.selectedCmdIndex > -1 && cmds && cmds[this.selectedCmdIndex]?.stderr?.length ? 0.5 : 1;
    this.stdout.height = Math.floor(((height - 1) - (top + (!this.getPkg()?.isGlobal ? cmdListAdditionalHeight : 0))) * multiplier);
    this.cmdList.left = left;
    this.stderr.left = left;
    this.stdout.left = left;
    this.cmdList.width = width;
    this.stderr.top = this.stdout.hidden ? top + cmdListAdditionalHeight : this.stdout.top + this.stdout.height;
    this.stderr.width = width;
    this.stderr.height = height - (this.stdout.hidden ? 0 : this.stdout.top + this.stdout.height) - 1;
    this.stdout.width = width;
  }

  render() {
    this.cmdList.render();
    this.stderr.render();
    if (Dashboard.instance?.selectedPackage && !this.stdout?.hidden) {
      this.stdout.render();
    }
  }

  hide() {
    super.hide();
    this.cmdList.hide();
    this.stderr.hide();
    this.stdout.hide();
  }

  updateVis() {
    super.show();
    const cmds = this.getPkgCmds();
    if (!cmds || !cmds.length) {
      this.cmdList.hide();
      this.stderr.hide();
      this.stdout.show();
      return;
    }

    // if (!this.getPkg().isGlobal) {
    this.cmdList.show();
    // }

    if (cmds[this.selectedCmdIndex]?.stderr) {
      this.stderr.show();
    } else {
      this.stderr.hide();
    }

    if (!cmds[this.selectedCmdIndex]?.stderr || (cmds[this.selectedCmdIndex]?.stdout) && !Dashboard.toggleDebug) {
      this.stdout.show();
    } else {
      this.stdout.hide();
    }
  }

  show() {
    super.show();
    this.cmdList.show();
    this.stderr.show();
    this.stdout.show();
  }

  setBack() {
    this.cmdList.setBack();
    this.stderr.setBack();
    this.stdout.setBack();
  }

  setFront() {
    this.cmdList.setFront();
    this.stderr.setFront();
    this.stdout.setFront();
  }

  detach() {
    this.cmdList.detach();
  }

  private stdoutLog(stackName: string, message: string) {
    try {
      if (!this.active || stackName !== Dashboard.stackName) {
        return;
      }
      const cmdIndex = this.processCmd(-1);
      if (!this.isCmdActive(cmdIndex)) {
        return;
      }

      if (message && message.length) {
        this.stdout.insertBottom(message);
      }
      const pkgCmd = this.getPkgCmd(cmdIndex);
      if (pkgCmd && !pkgCmd.alwaysScroll) {
        const value = this.stdout.getScrollPerc();
        if (value > 85) {
          this.stdout.setScrollPerc(100);
        }
      } else {
        this.stdout.setScrollPerc(100);
      }
    } catch (e) {
      //console.log(e);
    }
  }

  private stderrLog(stackName: string, message: string) {
    try {
      if (!this.active || stackName !== Dashboard.stackName) {
        return;
      }
      const cmdIndex = this.processCmd(-1);
      if (!this.isCmdActive(cmdIndex)) {
        return;
      }

      this.stderr.insertBottom(colors.red(message));
      const pkgCmd = this.getPkgCmd(cmdIndex);
      if (pkgCmd && !pkgCmd.alwaysScroll) {
        const value = this.stderr.getScrollPerc();
        if (value > 85) {
          this.stderr.setScrollPerc(100);
        }
      } else {
        this.stderr.setScrollPerc(100);
      }
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }
}
