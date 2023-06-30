import blessed from 'blessed';
import colors from 'colors/safe';
import { Dashboard } from './dashboard';
import { CenvPanel } from './panel';
import chalk from 'chalk';
import {CenvLog} from "@stoked-cenv/cenv-lib";

export default class CmdPanel extends CenvPanel {
  grid;
  cmdList;
  stdout;
  stderr;
  selectedCmdIndex = -1;
  debugStr;
  dashboard;

  constructor(dashboard) {
    super(dashboard);
  }

  init() {
    try {
      this.cmdList = this.addGridWidget(
          blessed.list,
          {
            keys: true,
            mouse: true,
            interactive: true,
            style: {
              text: 'red',
              selected: {
                bold: true,
                fg: [24, 242, 24],
                bg: 'black',
              },
              border: {fg: 'grey'},
              label: {side: 'left', fg: 'gray'},
              focus: {fg: 'red'}
            },
            template: {lines: true},
            selectedInverse: false,
            scrollable: true,
            scrollbar: {
              ch: ' ',
              inverse: true,
            },
            hidden: true
          },
          [0, 2, 1, 3],
          true,


      );
      this.cmdList.name = 'tasks';

      this.stdout = this.addGridWidget(
          blessed.text,
          {
            vi: true,
            fg: 'white',
            label: 'stdout',
            tags: true,
            keys: true,
            mouse: true,
            scrollable: true,
            scrollbar: {
              ch: ' ',
              inverse: true,
            },
            style: {
              fg: 'white',
              bg: 'black',
              border: {fg: 'gray'},
              label: {fg: 'gray'}
            },
            autoScroll: false,
            padding: {left: 1, right: 1, top: 0, bottom: 0}
          },
          [1, 2, 3, 3],
          true,
      );
      this.stdout.name = 'stdout'

      this.stdout.on(
          'wheeldown',
          function () {
            const index = Dashboard.instance.focusPool().indexOf(this.stdout);
            this.setFocus(index);
            this.stdout.scroll((this.stdout.height / 2) | 0 || 1);
            this.stdout.screen.render();
          }.bind(this),
      );
      this.stdout.on(
          'wheelup',
          function () {
            const index = Dashboard.instance.focusPool().indexOf(this.stdout);
            this.setFocus(index);
            this.stdout.scroll(-((this.stdout.height / 2) | 0) || -1);
            this.stderr.screen.render();
          }.bind(this),
      );
      this.stdout.on('click', function () {
          const index = Dashboard.instance.focusPool()?.indexOf(this.stdout);
          if (index !== undefined) {
            this.setFocus(index);
          }
        }.bind(this),
      );

      this.stderr = this.addGridWidget(
          blessed.box,
          {
            fg: 'brightRed',
            label: 'stderr',
            tags: true,
            keys: true,
            mouse: true,
            scrollable: true,
            scrollbar: {
              ch: ' ',
              inverse: true,
            },
            style: {
              fg: 'brightRed',
              bg: 'black',
              border: {fg: 'gray'},
              label: {fg: 'gray'}
            },
            autoScroll: false,
            padding: {left: 1, right: 1, top: 0, bottom: 0}
          },
          [4, 2, 2, 3],
          true,
      );
      this.stderr.name = 'stderr'
      this.stderr.setLabel(chalk.gray(`stderr`));

      this.stderr.on(
          'click',
          function () {
            const index = Dashboard.instance.focusPool().indexOf(this.stderr);
            this.setFocus(index);
          }.bind(this),
      );

      this.stderr.on(
          'wheeldown',
          function () {
            const index = Dashboard.instance.focusPool().indexOf(this.stderr);
            this.setFocus(index);
            this.stderr.scroll((this.stderr.height / 2) | 0 || 1);
            this.stderr.screen.render();
          }.bind(this),
      );

      this.stderr.on(
          'wheelup',
          function () {
            const index = Dashboard.instance.focusPool().indexOf(this.stderr);
            this.setFocus(index);
            this.stderr.scroll(-((this.stderr.height / 2) | 0) || -1);
            this.stderr.screen.render();
          }.bind(this),
      );

      this.cmdList.on(
          'click',
          function () {
            const index = Dashboard.instance.focusPool().indexOf(this.cmdList);
            this.setFocus(index);
          }.bind(this),
      );

      // eslint-disable-next-line @typescript-eslint/no-empty-function
      this.cmdList.on('action', function () {}.bind(this));
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      this.cmdList.on('select', function () {}.bind(this));
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      this.cmdList.on('move', function () {}.bind(this));


      this.cmdList.on('select item', function (item, index) {
          if (this.selectedCmdIndex === index) {
            return;
          }

          const cmd = this.getPkgCmd(index);
          if (!cmd) {
            return;
          }
          this.stderr.setContent(cmd.stderr);
          if (process.env.CENV_STDTEMP) {
            this.stdout.setContent(cmd.stdtemp || cmd.stdout);
          } else {
            this.stdout.setContent(cmd.stdout);
          }

          this.selectedCmdIndex = index;
          this.stderr.setScrollPerc(0);
          this.stdout.setScrollPerc(0);
        }.bind(this),
      );
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  getCmdText(cmdIndex, cmd) {
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
    return colors[color](cmd.cmd);
  }

  updateCmds() {
    try {

      if (this.getPkg().activeCmdIndex > -1) {
        this.selectedCmdIndex = this.getPkg().activeCmdIndex;
      }

      let cmds = this.getPkgCmds();
      cmds = cmds.map((c, i) => {
        if (process.env.CENV_STDTEMP) {
          if (c.code && c.code === 0 && c.stdtemp) {
            delete c.stdtemp;
          }
        }

        return this.getCmdText(i, c);
      });

      if (cmds && cmds.length) {
        this.cmdList.setItems(cmds);
        this.cmdList?.children?.map((c, i) => {
          if (!c.hasClicker) {
            c.on('click', function () {
                this.getPkg().activeCmdIndex = i;
                const index = Dashboard.instance.focusPool().indexOf(this.cmdList);
                this.dashboard.setFocusIndex(index);
              }.bind(this),
            );
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

  setFocus(focusIndex) {
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

  createCmd(cmd) {
    return {
      cmd: colors.green(cmd),
      vars: {},
      code: undefined,
      stderr: '',
      stdout: '',
    };
  }

  processCmd(cmdIndex) {
    const pkgCmds = this.getPkgCmds();
    if (cmdIndex === undefined || cmdIndex === -1) {
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

  private stdoutLog(stackName: string, message: string) {
    try {
      if (!this.active || stackName !== Dashboard.stackName) {
        return;
      }
      const cmdIndex = this.processCmd(undefined);
      if (!this.isCmdActive(cmdIndex)) {
        return;
      }

      if (message && message.length) {
        this.stdout.insertBottom(message);
      }
      const pkgCmd = this.getPkgCmd(cmdIndex);
      if (!pkgCmd.alwaysScroll) {
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

  err(stackName: string, message: string) {
    this.stderrLog(stackName, message);
  }

  private stderrLog(stackName: string, message: string) {
    try {
      if (!this.active || stackName !== Dashboard.stackName) {
        return;
      }
      const cmdIndex = this.processCmd(undefined);
      if (!this.isCmdActive(cmdIndex)) {
        return;
      }

      this.stderr.insertBottom(colors.red(message));
      const pkgCmd = this.getPkgCmd(cmdIndex);
      if (!pkgCmd.alwaysScroll) {
        const value = this.stderr.getScrollPerc();
        if (value > 85) {
          this.stderr.setScrollPerc(100);
        }
      } else {
        this.stderr.setScrollPerc(100);
      }
    } catch (e) {}
  }

  exitCmd(cmdIndex) {
    this.cmdList.items[cmdIndex] = this.getCmdText(
      cmdIndex,
      this.getPkgCmds()[cmdIndex],
    );
  }

  isCmdActive(cmdIndex) {
    return cmdIndex === this.selectedCmdIndex;
  }

  selectCmdOutput(cmdIndex) {
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
        this.stderr.setContent('');
      }
      if (pkgCmds[cmdIndex].stdtemp && process.env.CENV_STDTEMP) {
        this.stdout.setContent(pkgCmds[cmdIndex].stdtemp);
      } else if (pkgCmds[cmdIndex].stdout) {
        this.stdout.setContent(pkgCmds[cmdIndex].stdout);
      } else {
        this.stdout.setContent(' - ');
      }
    }
  }

  set(left, width, top, height) {
    this.cmdList.top = top;
    this.stdout.top = !this.getPkg()?.isGlobal ? top + this.cmdList.height : top;
    const cmds = this.getPkgCmds();
    const multiplier = this.selectedCmdIndex > -1 && cmds[this.selectedCmdIndex]?.stderr?.length ? 0.5 : 1;
    this.stdout.height = Math.floor(((height - 1) - (top + (!this.getPkg()?.isGlobal ? this.cmdList.height : 0))) * multiplier);
    this.cmdList.left = left;
    this.stderr.left = left;
    this.stdout.left = left;
    this.cmdList.width = width;
    this.stderr.top = this.stdout.top + this.stdout.height;
    this.stderr.width = width;
    this.stderr.height = height - (this.stdout.top + this.stdout.height) - 1;
    this.stdout.width = width;
  }

  render() {
    this.cmdList.render();
    this.stderr.render();
    this.stdout.render();
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
    if (!cmds) {
      this.cmdList.hide();
      this.stderr.hide();
      this.stdout.hide();
      return;
    }

    if (cmds?.length) {
      if (!this.getPkg().isGlobal) {
        this.cmdList.show();
      }
    } else {
      this.cmdList.hide();
      this.stderr.hide();
      this.stdout.hide();
      return;
    }

    if (cmds[this.selectedCmdIndex]?.stderr) {
      this.stderr.show();
    } else {
      this.stderr.hide();
    }

    if ((cmds[this.selectedCmdIndex]?.stdout || (cmds[this.selectedCmdIndex]?.stdtemp && process.env.CENV_STDTEMP)) && !Dashboard.toggleDebug) {
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
}
