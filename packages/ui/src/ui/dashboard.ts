import {blessed, contrib, getBlessedDeps} from './blessed';
import Dialogs from './dialogs';
import Menu from './menu';
import {Deployment, DeploymentMode} from '../deployment';
import {
  CenvFiles,
  CenvLog,
  CenvParams,
  clamp,
  colors,
  enumKeys,
  EnvironmentStatus,
  Package,
  ProcessStatus,
  Timer,
  getPkgContext,
} from '@stoked-cenv/cenv-lib';
import CmdPanel from './cmdPanel';
import StatusPanel from './statusPanel';
import {Suite} from '../suite';
import {Environment} from '../environment';
import chalk, {ChalkFunction} from 'chalk';
import {pbcopy} from '../utils';
import {isFunction} from "lodash";
import * as util from "util";
import {HelpUI} from "./help";


export enum DashboardMode {
  MIXED = 'MIXED',
  WIDE_CMD_FIRST = 'WIDE_CMD_FIRST',
  WIDE_STATUS_FIRST = 'WIDE_STATUS_FIRST',
  CMD = 'CMD',
  STATUS = 'STATUS'
}

export class Dashboard {
  screen;
  initialized = false;
  interval = null;
  timer = new Timer('deployment', 'seconds', true);
  debugTimer = new Timer('deployment debug', 'seconds', true);
  debugLog;
  status;
  statusText = '';
  debugStr = '';
  complete = false;
  packages;
  grid;
  progress;
  cmd: DeploymentMode;
  focusIndex = -1;
  focusedBox;
  cmdPanel: CmdPanel;
  statusPanel: StatusPanel;
  globalPkg: Package;
  menu;
  saveDump;
  priorityColumnWidth = [];
  columnWidth;
  columnSpacing = 2;
  maxColumnWidth;
  minColumnWidth = 12;
  tableWidth;
  splitter;
  suite: Suite;
  environment;
  packageBox;
  static toggleDebug = false;
  static instance: Dashboard = undefined;
  statusBar;
  static stackName = '';
  packageTs;
  nextPanel;
  mode: DashboardMode = DashboardMode.MIXED;
  modeLastWide: DashboardMode = DashboardMode.WIDE_CMD_FIRST;
  modeLast: DashboardMode = DashboardMode.MIXED;
  dependencies: string;
  dependenciesRemaining: string;
  cmdOptions: any;
  selectedPackage: string;
  selectedRowFg = undefined;
  selectedPackageFg = [14, 221, 14];
  selectedFullPackageFg = [40, 40, 40];
  selectedPackageFgHover = [20, 20, 20];
  selectedPackageBg = [65, 65, 65];
  selectedFullPackageBg = [14, 221, 14];
  selectedPackageBgHover = [24, 255, 24];
  selectedFullPackageBgHover = [24, 255, 24];
  packageBgHover = [15, 40, 15];
  hoverRowIndex = undefined;
  selectedRowIndex = undefined;
  selectedFully = false;
  blue = chalk.blue;
  blueBright = [0, 150, 255];
  red = [255, 0, 0];
  gray = [140, 140, 140];
  yellow = [225, 225, 0];
  orange = [255, 165, 0];
  white = [255, 255, 255];
  lightGray = [220, 220, 220];
  green = [0, 255, 0];
  statusBarInUse = false;
  packageHover = null;
  packageTimer = null;
  view = 'mixed';
  blessedDeps;
  selectItem = {};
  fullScreenCtrl;
  hidden = false;

  static shiftKeyDown = false;
  constructor(
    options: {
      packages: Package[];
      suite?: Suite;
      environment?: Environment;
      cmd?: DeploymentMode;
    },
    cmdOptions,
  ) {
    try {
      if (Dashboard.instance) {
        return;
      }

      CenvParams.dashboard = this;

      this.cmdOptions = cmdOptions;
      this.blessedDeps = getBlessedDeps();
      this.blessedDeps.dashboard = this;
      this.createBaseWidgets();
      this.statusPanel = new StatusPanel(this);
      this.cmdPanel = new CmdPanel(this);
      this.suite = options?.suite;
      this.environment = options?.environment;
      this.cmd = options?.cmd;

      Dashboard.instance = this;
    } catch (e) {
      CenvLog.single.catchLog(e);
    }

    try {
      this.global();
      this.packageBox = this.grid.set(0, 0, 1, 2, blessed.element, {
        mouse: true,
        keys: true,
        interactive: true,
        fg: 'white',
        label: 'package',
        style: {
          fg: 'white',
          bg: 'black',
          bold: true,
          border: { fg: 'black' },
          label: { bold: true },
        },
        border: false,
        transparent: true,
        height: 1,
        hideBorder: true,
      });

      this.statusBar = this.grid.set(5, 0, 1, 2, blessed.box, {
        fg: 'white',
        label: '',
        style: {
          fg: 'white',
          bg: 'black',
          label: {},
        },
        height: 1,
        hideBorder: true,
      });

      this.packages = this.grid.set(0, 0, 5, 2, contrib.table, {
        mouse: true,
        keys: true,
        interactive: true,
        fg: 'green',
        selectedFg: this.selectedPackageFg,
        selectedBg: this.selectedPackageBg,
        columnSpacing: this.columnSpacing,
        columnWidth: this.defaultColumnWidth,
        style: {
          border: { fg: [24, 242, 24] },
        },
      });

      this.packages.name = 'packages';
      this.packages.rows.name = 'packageRows';
      this.packages.rows.items.name = 'packageItems';

      this.packageHover = false;
      this.packageTimer = null;

      this.packages.on('element mouseover',
        async function mouseover(el, data) {

          if (el.parent?.name !== 'packageRows') {
            return;
          }

          const stackName = blessed.cleanTags(el.content).split(' ')[0];
          if (!stackName) {
            return;
          }
          const pkg = Package.getPackage(stackName);
          if (pkg) {
            if (!this.statusBarInUse) {
              this.statusBar.setLabel(pkg.getConsoleUrl());
            }
          }

          if (this.packages.rows.items[this.selectedRowIndex] === el) {
            this.hoverRowIndex = this.selectedRowIndex;
          } else {
            this.hoverRowIndex = this.packages.rows.getItemIndex(el);
          }

          await this.update();
        }.bind(this),
      );

      this.packages.on('element mouseout', function mouseout(el, data) {

          if (el.parent?.name !== 'packageRows') return;

          delete this.hoverRowIndex;
          el.render();

          if (!this.statusBarInUse) {
            if (Dashboard.stackName && Dashboard.stackName !== '') {
              this.statusBar.setLabel(
                Package.fromStackName(Dashboard.stackName).getConsoleUrl(),
              );
            } else {
              this.statusBar.setLabel('');
            }
          }
        }.bind(this),
      );

      this.columnWidth = this.defaultColumnWidth;
      this.maxColumnWidth = this.defaultColumnWidth.reduce(function (a, b) {
        return a + b;
      }) - 1;
      this.maxColumnWidth += (this.columnSpacing / 2) * this.columnWidth.length;


      for (let i = 0; i < this.defaultColumnWidth.length; i++) {
        this.priorityColumnWidth.push(
          this.defaultColumnWidth[this.columnPriority.indexOf(i)],
        );
      }

      this.focusedBox = this.packages;
      const debugPackageEvents = process.env.CENV_DEBUG_PACKAGE_EVENTS;
      this.packages.rows.on('move', async function move(item, index) {
        if (debugPackageEvents) Dashboard.debug('move', index);
      }.bind(this));

      this.packages.rows.on('action', async function action(var1, var2) {
        if (debugPackageEvents) Dashboard.debug('rows action', var2);
        if (var2 !== undefined) {
          this.selectedFully = true;
        }
      }.bind(this));

      this.packages.on('element click', async function elementClick(var1, var2) {
        if (debugPackageEvents) Dashboard.debug('packages element click', var1, var2);
        await this.selectPackage();
      }.bind(this));

      this.packages.on('click', async function packagesClick(var1, var2) {
        if (debugPackageEvents) Dashboard.debug('packages click', var1, var2);
      });

      this.packages.on('click select', async function clickSelect(var1, var2) {
        if (debugPackageEvents) Dashboard.debug('package click select', var1, var2);
      });

      this.packages.on('select item', async function packageSelectItem(var1, var2) {
        if (debugPackageEvents) Dashboard.debug('package select item', var1, var2);
      });

      this.packages.rows.on('click', async function rowClick(var1, var2) {
        if (debugPackageEvents) Dashboard.debug('rows click', var1, var2);
      });

      this.packages.rows.on('click select', async function clickSelect(var1, var2) {
        if (debugPackageEvents) Dashboard.debug('rows click select', var1, var2);
      });

      this.packages.rows.on('select item', async function packageSelectItem(var1, var2) {
        if (debugPackageEvents) Dashboard.debug(`select item - selected index: ${var2}, selectedRowIndex: ${this.selectedRowIndex}, full: ${this.selectedFully}`);
        await this.selectPackage();
      }.bind(this));

      this.debugLog = this.grid.set(5, 0, 1, 2, blessed.text, {
        fg: 'white',
        selectedFg: 'black',
        selectedBg: [24, 242, 24],
        label: 'debug',
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
          border: { fg: 'gray' },
        },
        autoScroll: true,
      });
      this.debugLog.setContent('');

      this.status = this.grid.set(5, 0, 1, 2, blessed.text, {
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
          border: { fg: 'gray' },
          label: { fg: 'gray' }
        },
        autoScroll: false,
        padding: { left: 2, right: 2, top: 0, bottom: 0 }
      });

      this.status.enableDrag = () => {
        // do nothing..
      }

      this.status.setContent('');

      this.screen.key('backspace', async function (ch, key) {
        if (!this.statusPanel?.enableSelection || this.focusedBox.type !== 'params') {
          return;
        }
        const pkg = this.getPkg();
        const typedVars = pkg.params?.localVarsTyped;
        delete typedVars[this.focusedBox.name][this.statusPanel.selectedParamKey];
        let vars: any = {};
        vars[this.focusedBox.name] = typedVars[this.focusedBox.name] ;
        if (this.focusedBox.name !== 'app') {
          vars.app = typedVars['app'];
        }
        if (this.focusedBox.name !== 'environment') {
          vars.environment = typedVars['environment'];
        }
        if (this.focusedBox.name !== 'global') {
          vars.global = typedVars['global'];
        }
        if (this.focusedBox.name !== 'globalEnv') {
          vars.globalEnv = typedVars['globalEnv'];
        }
        Package.global.info(JSON.stringify(vars, null, 2), 'vars')
        CenvFiles.SaveVars(vars, process.env.ENV, false);
        await CenvParams.removeParameters([this.statusPanel.selectedParamKey], {}, [this.focusedBox.name]);
        this.statusPanel.updateParams(pkg);

      }.bind(this));

      this.screen.key(['escape', 'q', 'C-c'], function (ch, key) {
        if (Dialogs.open()) {
          Dialogs.close();
        } else if (HelpUI.instance) {
          this.show();
        } else {
          this.screen.destroy();
          return process.exit(0);
        }
      });

      this.screen.key(['f'], function(ch, key) {
        if (!this.fullScreenCtrl) {
          this.fullScreenCtrl = this.focusPool()[this.focusIndex];
        } else {
          this.fullScreenCtrl = undefined;
        }
      }.bind(this))

      function printCmd(cmd) {
        let cmdText = `\n${cmd.cmd}:`;
        if (cmd.stdout && cmd.stdout != '') {
          cmdText += `\nstdout: ${cmd.stdout}`;
        }
        if (cmd.stderr && cmd.stderr != '') {
          cmdText += `\nstderr: ${cmd.stderr}`;
        }
        if (cmd.code) {
          cmdText += `\nexit code: ${cmd.code}`;
        }
        cmdText += '\n';
        return cmdText;
      }

      this.screen.key(
        ['ç'],
        function () {
          if (this.focusIndex === 0) {
            let text = Dashboard.stackName + ':\n';
            text += Package.cache[Dashboard.stackName].cmds.map((cmd) =>
              printCmd(cmd),
            );
            pbcopy(blessed.cleanTags(text));
          } else if (this.focusIndex === 1) {
            pbcopy(
              blessed.cleanTags(printCmd(
                Package.cache[Dashboard.stackName].cmds[this.cmdPanel.cmdList.selected],
              ))
            );
          } else if (this.focusIndex === 2) {
            pbcopy(
              blessed.cleanTags(Package.cache[Dashboard.stackName].cmds[this.cmdPanel.cmdList.selected].stdout)
            );
          } else if (this.focusIndex === 3) {
            pbcopy(blessed.cleanTags(this.cmdPanel.dependencies.getText()));
          }
        }.bind(this),
      );

      this.screen.key(
        ['C-s'],
        async function (ch, key) {
          Dialogs.saveSuiteDialog(this.screen);
        }.bind(this),
      );

      this.screen.key(
        ['C-d'],
        async function (ch, key) {
          //Dialogs.saveDump(this.screen);
        }.bind(this),
      );

      this.screen.key(['tab'],function (ch, key) {
          const isLastIndex = this.focusIndex + 1 > this.focusPool().length - 1;
          const newIndex = isLastIndex ? 0 : this.focusIndex + 1;
          this.setFocusIndex(newIndex);
        }.bind(this),
      );

      this.screen.key(['S-tab'], function (ch, key) {
          const newIndex = this.focusIndex - 1 < 0 ? this.focusPool().length - 1 : this.focusIndex - 1;
          this.setFocusIndex(newIndex);
        }.bind(this),
      );

      /*
      this.screen.key(
        ['f'],
        async function (ch, key) {
          Groups.toggleFullscreen();
        }.bind(this),
      );
     */

      this.splitter = blessed.box({
        parent: this.screen,
        left: 'center',
        top: 'center',
        width: 1,
        position: { left: this.maxColumnWidth - 1, width: 1 },
        height: '100%',
        style: {
          bg: [50, 50, 50],
          //transparent: true,
        },
        draggable: true,
      });

      this.screen.on('resize', function () {
          this.blessedDeps.splitterOverride = null;
          const newDefaultMax = this.maxColumnWidth;
          if (this.splitter.left > newDefaultMax) {
            this.splitter.left = newDefaultMax;
          }
          const tableCalcs = this.calcTableInfo();

          this.resizeWidgets(tableCalcs);
        }.bind(this),
      );

      this.menu = new Menu(this);
      this.packages.focus();
      this.statusPanel.init();
      this.cmdPanel.init();

      this.setMode(this.mode);

      setInterval(
        async function mainLoop() {
          await this.update();
          //const item =
            //this.packages?.rows?.items[this.packages?.rows?.selected];
          //if (!Dashboard.stackName && item) {
            //await selectIt(item);
          //}
        }.bind(this),
        10,
      );
      if (!this.cmd) {
        setTimeout(
          async function init() {
            await Package.checkStatus(DeploymentMode.DEPLOY.toString(), ProcessStatus.COMPLETED);
          }.bind(this),
        );
      }

      this.initialized = true;
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  isWideMode() {
    return [DashboardMode.WIDE_CMD_FIRST, DashboardMode.WIDE_STATUS_FIRST].indexOf(this.mode) > -1
  }

  useBothPanels(mode: DashboardMode = this.mode) {
    return [DashboardMode.WIDE_CMD_FIRST, DashboardMode.WIDE_STATUS_FIRST, DashboardMode.MIXED].indexOf(this.mode) > -1
  }

  global(): Package {
    return this.globalPkg;
  }

  getSelectedPackageRow() {
    return this.packages.rows.items[this.selectedRowIndex];
  }

  cyclePanelModes() {
    const nextMode = this.nextMode();
    this.setMode(nextMode);
    return nextMode;
  }

  private debug(...text) {
    if (!this.debugLog) {
      return;
    }
    const scroll = this.debugLog.getScrollPerc();
    this.debugLog.insertBottom(chalk.green(text.join(' ')));
    if (scroll > 90) {
      this.debugLog.setScrollPerc(100);
    }
  }

  static debug(...text: string[]) {
    if (text.join() === '') {
      return;
    }
    if (Dashboard.instance) {
      Dashboard.instance?.debug(...text);
    } else {
      CenvLog.single.infoLog(colors.alert('DEBUG DATA -> ') + text.join(' '));
    }
  }

  static debugSet(...text: string[]) {
    if (text.join() === '') {
      return;
    }
    if (Dashboard.instance) {
      Dashboard.instance?.debugLog.setContent(text.join())
    }
  }

  log(stackName: string, ...text: string[]) {
    stackName = blessed.cleanTags(stackName);

    //
    const finalMsg = text.join(' ');
    this.storeLog(stackName, finalMsg, 'stdout');
    if (stackName !== Dashboard.stackName) {
      return;
    }
    this.cmdPanel?.out(stackName, finalMsg);
    if (this.cmdPanel?.stdout?.hidden) {
      this.cmdPanel.updateVis();
    }
  }

  static log(stackName: string, ...text: string[]) {
    Dashboard.instance?.log(stackName, ...text);
  }

  get tableHeaders() {
    return [' name', ' ver.', ' type', ' process', ' environment', ' time'];
  }

  get columnPriority() {
    return [0, 5, 4, 2, 1, 3];
  }

  get defaultColumnWidth() {
    return [30, 12, 10, 13, 13, 10];
  }

  logErr(stackName: string, ...text: string[]) {
    stackName = blessed.cleanTags(stackName);
    //const finalMsg = text.map((t) => (t.endsWith('\n') ? t : t + '\n'))
      //.join(' ');
    const finalMsg = text.join(' ');
    this.storeLog(stackName, text.join(' '), 'stderr');
    if (stackName !== Dashboard.stackName) {
      return;
    }

    this?.cmdPanel?.err(stackName, finalMsg);
  }

  static logErr(stackName: string, ...text: string[]) {
    Dashboard.instance?.logErr(stackName, ...text);
  }

  createBaseWidgets() {
    const title = this.getTitle();
    const screen = blessed.screen({
      smartCSR: true,
      autoPadding: true,
      warnings: true,
      title: title,
      cursor: {
        artificial: true,
        shape: 'line',
        blink: true,
        color: null, // null for default
      },
    });

    this.screen = screen;

    //create layout and widgets
    this.grid = new contrib.grid({ rows: 6, cols: 5, screen: this.screen });
  }

  getPackageRowName(index = this.packages?.rows?.selected) {
    const items = this.packages?.rows?.items;
    const itemsLength = items?.length;
    if (index > -1 && itemsLength && index < itemsLength) {
      return items[index].content.split(' ')[0];
    }
  }

  nextMode() {
    let foundMode = false;
    for (const value of enumKeys(DashboardMode)) {
      if (foundMode) {
        return DashboardMode[value];
      }
      if (DashboardMode[value] === this.mode) {
        foundMode = true;
      }
    }
    return DashboardMode.MIXED;
  }

  setMode(mode: DashboardMode) {
    this.mode = mode;
    this.setPanels();
  }

  setPanels(mode: DashboardMode = this.mode) {
    this.cmdPanel.updateVis();
    if (mode === DashboardMode.CMD) {
      this.statusPanel.hide();
    } else {
      this.statusPanel.updateVis();
    }
  }

  getTitle() {
    let titleRoot = 'cenv';
    let titleNoun;
    if (this.cmd) {
      titleRoot = this.cmd === DeploymentMode.DEPLOY ? 'deploy' : 'destroy';

      const opt = Deployment?.options;
      if (opt?.suite) {
        titleNoun = opt.suite + ' suite';
      } else if (opt?.applications?.length > 1) {
        titleNoun = `${opt?.applications?.length} application(s)`;
      } else if (opt?.applications?.length === 1) {
        titleNoun = opt.applications[0];
      }
    }

    const title = `${titleRoot}${titleNoun ? ' ' + titleNoun : ''}`;
    return title;
  }

  focusPool() {
    let ctrls = [this.packages];
    if ([DashboardMode.MIXED, DashboardMode.WIDE_STATUS_FIRST].indexOf(this.mode) > -1) {
      if (this.statusPanel?.focusPool) {
        ctrls = ctrls.concat(this.statusPanel.focusPool);
      }
      if (this.cmdPanel?.focusPool) {
        ctrls = ctrls.concat(this.cmdPanel.focusPool);
      }
    } else if (this.mode === DashboardMode.WIDE_CMD_FIRST) {
      if (this.cmdPanel?.focusPool) {
        ctrls = ctrls.concat(this.cmdPanel.focusPool);
      }
      if (this.statusPanel?.focusPool) {
        ctrls = ctrls.concat(this.statusPanel.focusPool);
      }
    } else if (this.mode === DashboardMode.CMD) {
      if (this.cmdPanel?.focusPool) {
        ctrls = ctrls.concat(this.cmdPanel.focusPool);
      }
    } else if (this.mode === DashboardMode.STATUS) {
      if (this.statusPanel?.focusPool) {
        ctrls = ctrls.concat(this.statusPanel.focusPool);
      }
    }
    return ctrls;
  }

  static getFocusWidget() {
    const focusWidget =
      Dashboard.instance.focusPool()[Dashboard.instance.focusIndex];

    return focusWidget;
  }

  setFocusIndex(index) {
    if (this.focusIndex === index) {
      return;
    }

    const focusItems = this.focusPool();
    if (!focusItems) {
      return;
    }

    if (this.focusedBox) {
      const box = this.focusedBox?.rows ? this.focusedBox.rows : this.focusedBox;
      if (box.style?.selected) {
        box.style.selected.bold = true;
        //box.style.selected.fg = 'white';
        //box.style.selected.bg = [15, 40, 15];
      }
      if (box.style?.item) {
        //box.style.item.fg = [140, 140, 140];
        //box.style.item.bg = 'black';
      }
      if (this.focusedBox?.style?.label?.oldFg) {
        this.focusedBox.style.label.fg = this.focusedBox.style.label.oldFg;
      }
      if (this.focusedBox.type === 'params') {
        this.focusedBox.rows.selected = -1;
        this.statusPanel.selectedParamKey = undefined;
        const textIndex = this.focusPool().indexOf(Dashboard.instance.statusPanel.paramTextbox)

        if (textIndex > -1) {
          this.statusPanel.focusPool.pop();
          this.statusPanel.focusPool.pop();
        }
        this.statusPanel.paramLabel.hide();
        this.statusPanel.paramTextbox.hide();
        this.statusPanel.paramForm.hide();
      }
      if (box.style?.label?.oldFg) {
        box.style.label.fg = box.style.label.oldFg;
        delete box.style.label.oldFg;
      }
      this.focusedBox.style.border.fg = 'gray';
    }

    this.focusedBox = focusItems[index];
    if (this.focusedBox) {
      const box = this.focusedBox?.rows ? this.focusedBox.rows : this.focusedBox;
      if (box.style?.selected) {

      }
      if (this.focusedBox?.style?.label?.fg) {
        this.focusedBox.style.label.oldFg = this.focusedBox.style.label.fg;
        this.focusedBox.style.label.fg = [24, 242, 24]
      }
      if (box?.style?.border?.fg) {
        box.style.border.fg = [24, 242, 24];
      }
      if (this.focusedBox?.style?.border?.fg) {
        this.focusedBox.style.border.fg = [24, 242, 24];
      }
      if (this.focusedBox.type === 'params' || this.focusedBox.type === 'paramsUI') {
        this.statusPanel.paramLabel.show();
        this.statusPanel.paramTextbox.show();
        this.statusPanel.paramForm.show();
      }
      this.focusedBox.focus();
    }

    this.focusIndex = index;
    this.screen.render();
  }

  getPkg(stackName?: string) {
    return Package.cache[stackName ? stackName : Dashboard.stackName];
  }

  storeLog(stackName, message: string, type) {
    const pkg = this.getPkg(stackName);
    if (!pkg) {
      Dashboard.debug('stackName not found: ' + stackName + ' - ' + message, new Error().stack);
      return;
    }

    if (!pkg.cmds.length) {
      pkg.createCmd('log');
    }

    let cmd = pkg.cmds[pkg.cmds.length - 1];

    if (!cmd.running) {
      //CenvLog.single.catchLog(new Error());
      pkg.createCmd('log');
      cmd = pkg.cmds[pkg.cmds.length - 1];
    }
    const finalMsg = message.endsWith('\n') ? message : message + '\n';
    if (cmd[type]) {
      cmd[type] += finalMsg;
    } else {
      cmd[type] = finalMsg;
    }
  }

  lastSelectedFully = false;

  async selectPackage() {
    try {
      const stackName = blessed.cleanTags(this.getPackageRowName());
      if (stackName === '') {
        return;
      }

      if (this.focusIndex !== 0) {
        this.setFocusIndex(0);
      }

      if (!this.statusPanel?.initialized) {
        this.statusPanel.initialized = true;
      }

      if (this.selectedRowIndex === this.packages.rows.selected) {
        if (!Dialogs.open() && this.lastSelectedFully) {
          Dialogs.add(this.menu);
        }
        this.lastSelectedFully = this.selectedFully;
        return;
      }
      const selectedPackage = Package.cache[stackName];
      this.packageBox.setLabel(`${chalk.white.bold('selectedPackage.packageName')}`)

      this.lastSelectedFully = false;
      this.selectedRowIndex = this.packages.rows.selected;
      this.selectedFully = false;

      Dialogs.close(this.menu);
      this.selectedPackage = stackName;
      Dashboard.stackName = stackName;
      this.setPanels(this.mode);

      this.packageTs = Date.now();

      const color = this.getStatusColor(
        selectedPackage.environmentStatusReal,
        true,
      ) as ChalkFunction;
      let env = '';
      let envQuote = '';
      if (selectedPackage.packageName !== 'GLOBAL') {
        env = ` [${color(selectedPackage.environmentStatusReal)}]`;
        envQuote = this.packageHover
          ? ` - (${color(selectedPackage.getEnvironmentStatusDescription())})`
          : '';
      }

      this.packageBox.setLabel(`${selectedPackage.packageName}${env}${envQuote}\n\n`);

      setTimeout(async () => {
        await this.statusPanel.updatePackage();
        await this.cmdPanel.updatePackage();
      }, 50);

      this.redraw();
      this.screen.render();
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  debounceFlags = {};
  clearLabelTimeout = undefined;
  setStatusBar(name, msg) {
    if (msg === '' || this.debounceFlags[name]) {
      delete this.debounceFlags[name];
      return;
    }
    Dashboard.instance.statusBarInUse = true;
    this.statusBar?.setLabel(msg);
    this.debounceFlags[name] = true;

    setTimeout(() => {
      Dashboard.instance.statusBarInUse = false;
      delete this.debounceFlags[name];
    }, 250);

    if (this.clearLabelTimeout) {
      clearTimeout(this.clearLabelTimeout);
    }
    this.clearLabelTimeout = setTimeout(() => {
      Dashboard.instance.statusBar.setLabel('');
    }, 2000);
  }

  getUpdatePackages() {

    const pks = Object.values(Package.cache).filter((p: Package) => !p.skipUI || Deployment.toggleDependencies);
    const noGlobals = pks.filter(p => p.stackName !== 'GLOBAL');
    const upToDate = !noGlobals.filter(p => p.environmentStatus !== EnvironmentStatus.UP_TO_DATE).length;
    const notDeployed = !noGlobals.filter(p => p.environmentStatus !== EnvironmentStatus.NOT_DEPLOYED).length;
    const processing = !!noGlobals.filter(p => p.processStatus === ProcessStatus.PROCESSING).length;
    const completed = !noGlobals.filter(p => p.processStatus !== ProcessStatus.COMPLETED).length;
    const statusCheck = !!noGlobals.filter(p => p.processStatus === ProcessStatus.STATUS_CHK).length;
    const ctx = this.getPkg() ? getPkgContext(this.getPkg()) : false;

    let envStatus = EnvironmentStatus.NEEDS_UPDATE;
    if (upToDate) {
      envStatus = EnvironmentStatus.UP_TO_DATE;
    } else if (notDeployed) {
      envStatus = EnvironmentStatus.NOT_DEPLOYED;
    }

    let processStatus = ProcessStatus.NONE;
    if (processing) {
      processStatus = ProcessStatus.PROCESSING;
    } else if (statusCheck) {
      processStatus = ProcessStatus.STATUS_CHK;
    } else if (completed) {
      pks.map(p => p.processStatus = ProcessStatus.NONE)
    } else if (ctx) {
      Package.global?.timer?.elapsed(true);
    }

    let packages: any = Object.values(Package.cache)
      .filter((p: Package) => !p.skipUI || Deployment.toggleDependencies)
      .map((p: Package) => {
        if (p.isGlobal) {
          return {
            stackName: p.stackName,
            processStatus: processStatus,
            environmentStatus: envStatus || 'NONE',
            timer: Package.global.timer?.elapsed()?.elapsed ? `${Package.global.timer?.elapsed()?.elapsed}s` : '-----',
            type: '-----',
            statusTime: p.statusTime,
            version: '-----'
          }
        }
        return {
          stackName: p.stackName,
          processStatus: p.processStatus,
          environmentStatus: p.environmentStatus,
          timer: p.timer ? `${p.timer?.elapsed()?.elapsed}s` : 'N/A',
          type: p.type,
          statusTime: p.statusTime,
          version: p.rollupVersion,
        };
      });

    const environmentOrder = Object.values(EnvironmentStatus);
    const deploymentOrder = Object.values(ProcessStatus);
    const global = packages.filter(p => p.stackName === 'GLOBAL')[0];
    packages = packages
      .filter(p => p.stackName !== 'GLOBAL')
      .sort((a, b) => (a?.statusTime < b?.statusTime ? 1 : -1))
      .sort(
        (a, b) =>
          environmentOrder.indexOf(a.environmentStatus) -
          environmentOrder.indexOf(b.environmentStatus),
      )
      .sort(
        (a, b) =>
          deploymentOrder.indexOf(a.processStatus) -
          deploymentOrder.indexOf(b.processStatus),
      );
    packages.unshift(global)
    return packages;
  }

  async getUpdateData(packages) {
    try {
      let complete = true;
      let hasNonGlobals = false;
      let selectedPos = -1;
      const tableCalcs = this.calcTableInfo();
      const headers = [tableCalcs.columns];
      const data = [];
      const selectedColor = chalk.rgb(
        this.selectedPackageFg[0],
        this.selectedPackageFg[1],
        this.selectedPackageFg[2],
      );
      const selectedHoverColor = chalk.rgb(
        this.selectedPackageFgHover[0],
        this.selectedPackageFgHover[1],
        this.selectedPackageFgHover[2],
      );

      const currentlySelected = {stackName: '', index: -1};
      for (let i = 0; i < packages.length; i++) {
        if (i === 0) {
          for (let j = 0; j < tableCalcs.columns; j++) {
            headers[this.columnPriority[j]] =
              this.tableHeaders[this.columnPriority[j]];
          }
        }
        const pkg = packages[i];
        if (
          pkg.stackName === Dashboard.stackName &&
          this.selectedRowIndex !== i
        ) {
          selectedPos = i;
        }
        if (!pkg.isGlobal) {
          hasNonGlobals = true;
        }
        const isHoverRow = i === this.hoverRowIndex;
        const isSelectedRow = i === this.selectedRowIndex;
        const envColor = this.getStatusColor(pkg.environmentStatus, isHoverRow) as ChalkFunction;
        const processColor = this.getStatusColor(pkg.processStatus, isHoverRow) as ChalkFunction;
        if (!pkg.isGlobal) {
          complete = false;
        }

        const row = [];
        const selected = isSelectedRow;
        if (selected) {
          currentlySelected.stackName = pkg.stackName;
          currentlySelected.index = i;
        }

        if (pkg.stackName === Dashboard.stackName && this.selectedRowIndex !== i) {
          this.selectedRowIndex = i;
        }

        const hover = i === this.hoverRowIndex;
        let rowColor = envColor;
        if (pkg.stackName === 'GLOBAL') {
          rowColor = this.getChalkColor(this.yellow, false, 0, isHoverRow) as ChalkFunction;

        } else if (selected && hover) {
          rowColor = selectedHoverColor;
          this.selectedRowFg = this.getStatusColor(pkg.environmentStatus, isHoverRow, true);
        } else if (selected) {
          rowColor = selectedColor;
          this.selectedRowFg = this.getStatusColor(pkg.environmentStatus, isHoverRow, true);
        }

        if (!isFunction(rowColor)) {
          rowColor = chalk.rgb(rowColor[0], rowColor[1], rowColor[2])
        }
        row.push(rowColor(pkg.stackName));
        row.push(rowColor(pkg.isGlobal ? '-----' : pkg.version));
        row.push(rowColor(pkg.type));
        row.push(rowColor(pkg.processStatus));
        row.push(rowColor(pkg.environmentStatus));
        row.push(rowColor(pkg.timer));

        const finalRow = [tableCalcs.columns];
        for (let j = 0; j < tableCalcs.columns; j++) {
          finalRow[this.columnPriority[j]] = row[this.columnPriority[j]];
        }

        data.push(finalRow);
      }
      if (this.selectedRowIndex != this.packages.rows.selected) {
        this.packages.rows.select(this.selectedRowIndex)
      }
      return {data, complete: complete && hasNonGlobals, headers, tableCalcs};
    } catch (e) {
      CenvLog.single.catchLog(e)
    }
  }


  mod(digit, mod) {
    return clamp(
      Math.abs(255 - digit) < Math.abs(0 - digit) ? digit - mod : digit + mod,
      0,
      255,
    );
  }

  getChalkColor(colorRgb, hover, sub, rgb) {
    const mod = hover ? 0 : sub;
    const r = this.mod(colorRgb[0], mod);
    const g = this.mod(colorRgb[1], mod);
    const b = this.mod(colorRgb[2], mod);

    if (rgb) {
      return [r, g, b];
    }
    const color = chalk.rgb(r, g, b);
    if (!hover) return color.dim;
    return color.bold;
  }

  getStatusColor(status, hover, rgb = false) {
    switch (status) {
      case ProcessStatus.BUILDING:
      case ProcessStatus.HASHING:
      case ProcessStatus.BUMP:
      case ProcessStatus.STATUS_CHK:
      case ProcessStatus.PROCESSING:
        return this.getChalkColor(this.blueBright, hover, 30, rgb);
      case ProcessStatus.FAILED:
      case ProcessStatus.CANCELLED:
      case EnvironmentStatus.CANCELLED:
      case EnvironmentStatus.NOT_DEPLOYED:
      case EnvironmentStatus.NEEDS_FIX:
        return this.getChalkColor(this.red, hover, 15, rgb);
      case ProcessStatus.SKIPPED:
      case EnvironmentStatus.INITIALIZING:
        return this.getChalkColor(this.gray, hover, 15, rgb);
      case ProcessStatus.NONE:
      case EnvironmentStatus.NONE:
        return this.getChalkColor(this.yellow, false, 0, rgb);
      case EnvironmentStatus.NEEDS_UPDATE:
      case EnvironmentStatus.INCOMPLETE:
        return this.getChalkColor(this.orange, hover, 15, rgb);
      case ProcessStatus.HAS_PREREQS:
        return this.getChalkColor(this.lightGray, hover, 35, rgb);
      case ProcessStatus.INITIALIZING:
      case ProcessStatus.READY:
      case EnvironmentStatus.NONE:
        return this.getChalkColor(this.white, hover, 22, rgb);
      case EnvironmentStatus.UP_TO_DATE:
      case ProcessStatus.COMPLETED:
        return this.getChalkColor(this.green, hover, 24, rgb);
    }
  }

  updateDependenciesStatus() {
    const pkg = this.getPkg();
    if (!pkg) {
      return;
    }
    if (pkg?.deployDependencies) {
      const deps = pkg?.deployDependencies?.map((dep: Package) => {
        const color = this.getStatusColor(dep.environmentStatus, true) as ChalkFunction;
        return color(dep.packageName)
      }).join(', ');
      this.dependencies = `${deps}`;
    } else if (pkg?.meta?.service) {
      const deps = pkg?.meta?.service?.map((dep: Package) => {
        const color = this.getStatusColor(dep.environmentStatus, true) as ChalkFunction;
        return color(dep.packageName)
      }).join(', ');
      this.dependencies = deps;
    } else {
      this.dependencies = '';
    }
  }

  static tabSpaces(text) {
    const regex = /[\t]/g;
    return text.match(regex)?.length;
  }

  static createBox(ctrl, title: string, lines: string[], bgColor, fgColor, topPadding = 1, sidePadding = 2) {
    const statWidth = ctrl.width - 3;
    const leftPadding = sidePadding + ctrl.padding.left;
    const tab = '----';
    const tabR = '0000';
    const rightPadding = sidePadding - 1 + ctrl.padding.right; // right side has 1 space automagically

    function boxLine(text = '') {
      text = tab + text;
      return `${' '.repeat(sidePadding)}${bgColor(`${text}${' '.repeat(clamp(statWidth - leftPadding - rightPadding - blessed.cleanTags(text).length, 0, 255))}`)}\n`
    }

    function spaceLeft(line) {
      return statWidth - line.length - leftPadding - rightPadding - tab.length ;
    }

    try {
      lines = lines.map(l => blessed.cleanTags(l.replace(/\t/g, tabR)));

      let boxText = boxLine();
      boxText += boxLine(fgColor(title + ':'));
      boxText += boxLine();

      //const debugStr = []
      for (let i = 0; i < lines?.length; i++) {
        const fix = lines[i];
        const fixLines = fix.split('\n');
        for (let j = 0; j < fixLines?.length; j++) {
          let exitLoopCount = 0;
          const startsWithTab = fixLines[j].startsWith(tabR) ? tabR : '';
          let line = fixLines[j];
          let extraSpace = spaceLeft(line);

          const startedLoop = extraSpace < 0;
          while (extraSpace < 0 && exitLoopCount < 10) {
            const endOfLine = statWidth - tab.length - leftPadding;
            const lastSpace = line.substring(0, endOfLine).lastIndexOf(' ');
            const nextLine = line.substring(lastSpace + 1);
            const shortLine = line.substring(0, lastSpace);
            boxText += boxLine(shortLine);
            exitLoopCount++;
            line = exitLoopCount < 1 ? nextLine : startsWithTab + nextLine;
            extraSpace = spaceLeft(line);
          }
          boxText += boxLine(!startedLoop || exitLoopCount >= 1 ? line : startsWithTab + line);
        }
        boxText += boxLine();
      }
      return boxText.replace(/----/g, '    ').replace(/0000/g, '    ') + '\n';
    } catch(e) {
      Package.global.err(e.stack);
    }
  }

  updateStatus() {
    this.updateDependenciesStatus();

    const packages = Package.getPackages().filter(p => !p.isGlobal);
    let noun = '';
    const opt = this.cmdOptions;
    const multiplePackagesLoaded = packages.length > 1;

    if (opt.suite) {
      noun = `${chalk.bold(opt.suite)}`;
    } else if (packages.length > 1) {
      noun = `${chalk.bold(packages.length)} packages`;
    } else if (packages?.length === 1) {
      noun = `${chalk.bold(packages[0].packageName)}`;
    }

    let status = '';
    const selectedPackage = Package.cache[Dashboard.stackName];
    const validStatus = selectedPackage && Dashboard.stackName && Dashboard.stackName !== '' && [ProcessStatus.BUILDING, ProcessStatus.STATUS_CHK, ProcessStatus.INITIALIZING].indexOf(selectedPackage?.processStatus) === -1
    if ((multiplePackagesLoaded && Dashboard.stackName === 'GLOBAL') || !validStatus) {
      status += '\n';
      this.status.setLabel(noun);
      this.splitter.setFront();
      this.statusBar.setFront();
      const slices = {};

      const notSkipped = Package.getPackages().filter(p => !p.skipUI);
      slices['notSkipped'] = notSkipped;

      const skipped = Package.getPackages().filter(p => p.skipUI);
      slices['skipped'] = skipped;

      const cenvPackages = packages.filter((p: Package) => p.params?.hasCenvVars);
      slices['cenvPackages'] = cenvPackages;

      const cenvDeployedPackages = packages.filter((p: Package) => p.params?.hasCenvVars);
      slices['cenvDeployedPackages'] = cenvDeployedPackages;

      const cenvMaterializedPackages = packages.filter((p: Package) => p.params?.materializedVarsVersion)
      slices['cenvMaterializedPackages'] = cenvMaterializedPackages;

      const longestNumber: string = Object.values(slices).reduce(
        function (a: string, b: string) {
          return a.length > b.length ? a : b;
        }) as string;

      const longestNumberLength = longestNumber.length.toString().length;
      function statusMetric (num: number, type: string, extension = '') {
        return `\t${chalk.bold(num.toString().padStart(longestNumberLength))} ${type}${extension ? `\n${extension}` : ''}\n`
      }

      status += statusMetric(notSkipped.length, 'packages');
      if (skipped.length) {
        status += statusMetric(skipped.length, 'hidden packages (dependencies disabled)');
      }
      status += statusMetric(cenvPackages.length, 'packages w/ cenv vars');
      status += statusMetric(cenvDeployedPackages.length, 'packages w/ deployed vars');
      status += statusMetric(cenvMaterializedPackages.length, 'packages w/ materialized vars\n\n');

      function packageStatus (environmentStatus: EnvironmentStatus) {
        const color = Dashboard.instance.getStatusColor(environmentStatus, true) as ChalkFunction;
        const pkgs = packages.filter((p: Package) => p.environmentStatus === environmentStatus);
        return `[${color(environmentStatus)}]: ${chalk.bold(pkgs.length.toString())}\n${color(pkgs.map(d => d.packageName).join(', '))}\n\n`
      }
      status += packageStatus(EnvironmentStatus.UP_TO_DATE);
      status += packageStatus(EnvironmentStatus.NEEDS_UPDATE);
      status += packageStatus(EnvironmentStatus.NEEDS_FIX);
      status += packageStatus(EnvironmentStatus.NOT_DEPLOYED);

      if (!validStatus && selectedPackage && !selectedPackage.isGlobal) {
        status += `${selectedPackage.packageName}: ${selectedPackage.processStatus === ProcessStatus.STATUS_CHK ? 'checking status' : 'current status [' + selectedPackage.processStatus + ']'}`;
      }
    } else {
      if (validStatus) {
        const color = this.getStatusColor(selectedPackage.environmentStatus,true) as ChalkFunction;
        const colorDark = this.getStatusColor(selectedPackage.environmentStatus,false) as ChalkFunction;
        const env =
          selectedPackage.packageName !== 'GLOBAL' ? `[${color(selectedPackage.environmentStatus)}] ` : '';
        const envComment = selectedPackage.getEnvironmentStatusDescription();
        this.status.setLabel(`${chalk.bold(selectedPackage.packageName)} ${env}`);
        this.splitter.setFront();
        this.statusBar.setFront();

        if (selectedPackage.status?.needsFix?.length) {
          status += '\n' + Dashboard.createBox(this.status, 'NEEDS FIX', selectedPackage.status.needsFix, chalk.bgRed, chalk.whiteBright.underline);
        }
        if (selectedPackage.status?.incomplete?.length) {
          status += `\n${colors.error.underline.bold('NEEDS DEPLOY:')}\n\n`;
          status += `\t${selectedPackage.status.incomplete.join('\n\t')}\n`
        }
        if (selectedPackage.status?.deployed?.length) {
          status += `\n${colors.success.underline.bold('UP_TO_DATE:')}\n\n`;
          status += `\t${selectedPackage.status.deployed.join('\n\t')}\n\n`;
        }

        this.statusPanel.dependencies.setContent(`${this.dependencies}\n\n`);
      } else {
        status += `${selectedPackage.packageName}: ${selectedPackage.processStatus === ProcessStatus.STATUS_CHK ? 'checking status' : 'current status [' + selectedPackage.processStatus + ']'}`;
      }
    }
    this.statusText = status;
    this.status.setContent(this.statusText);
    this.splitter.setFront();
    this.statusBar.setFront();
  }

  updatePackageVisuals() {
    if (this.packages?.rows?.items) {
      const global = Dashboard.stackName === 'GLOBAL';
      this.packages.rows.items.map((item, index) => {
        const hover = index === this.hoverRowIndex;
        if (item === this.packages.rows.items[this.selectedRowIndex]) {
          const selectedHover = item.selected && hover;
          let selectedFg = this.selectedFully ? this.selectedFullPackageFg : this.selectedRowFg;
          let selectedBg = this.selectedFully ? this.selectedFullPackageBg : this.selectedPackageBg;
          if (global) {
            selectedFg = this.selectedFully ? this.selectedFullPackageFg : this.yellow;
            selectedBg = this.selectedFully ? this.yellow : this.selectedPackageBg;
          }
          item.style.fg = selectedHover ? this.selectedPackageFgHover : selectedFg;
          item.style.bg = selectedHover ? this.selectedPackageBgHover : selectedBg;
        } else if (hover) {
          item.style.bg = this.packageBgHover;
        } else {
          item.style.bg = undefined;
        }
      });
    }
  }

  async update() {
    try {
      if (!this.initialized && !this.statusPanel.initialized) return;

      if (Dashboard.stackName === '') {
        this.packages.rows.select(0);
      }

      this.updateStatus();
      this.updatePackageVisuals();

      const packages = this.getUpdatePackages();
      const { data, complete, headers, tableCalcs } = await this.getUpdateData(packages);

      if (complete) {
        this.complete = true;
        Package.global?.timer?.elapsed(true);
      }

      if (Object.keys(Package.cache).length) {
        this.packages.rows.interactive = false;
        this.packages.setData({
          headers: headers,
          data: data,
        });
        this.packages.rows.interactive = true;
        if (this.packages?.headers) {
          this.packages.headers.name = 'headers';
        }

        if (!this.packages.rows.initialized) {
          this.packages.rows.initialized = true;
        }
        this.packages.rows.items.map((i, index) => {
          if (!i.initalized) {
            i.initalized = true;
            i.on(
              'click',
              async function () {
                this.packages.rows.focus();
                if (this.packages.rows.items[this.selectedRowIndex] === i) {
                  this.packages.rows.emit('action', i, i.selected);
                  this.packages.rows.emit('select', i, i.selected);
                  return;
                }

                this.packages.rows.screen.render();
                this.packages.rows.emit('click select', i, index);
              }.bind(this),
            );
          }
        });
      }


      this.render(tableCalcs);
    } catch (e) {
      CenvLog.single.catchLog(e as Error);
    }
  }

  render(tableCalcs) {
    if (this.hidden) {
      return;
    }
    if (this.fullScreenCtrl) {
      this.fullScreenCtrl.setFront();
      this.fullScreenCtrl.left = 0;
      this.fullScreenCtrl.top = 0;
      this.fullScreenCtrl.height = this.screen.height - 1;
      this.fullScreenCtrl.width = this.screen.width;
      this.fullScreenCtrl.render();
    } else {
      this.resizeWidgets(tableCalcs);
      const title = this.getTitle();
      if (this.screen.title !== title) {
        this.screen.title = title;
      }

      this.statusPanel.updateVis();
      if (this.useBothPanels()) {
        const isWideCmdFirst = this.mode === DashboardMode.WIDE_CMD_FIRST;
        if (isWideCmdFirst) {
          this.cmdPanel.setFront();
          this.statusPanel.setFront();
        } else {
          this.statusPanel.setFront();
          this.cmdPanel.setFront();
        }
        this.cmdPanel.render();
        this.statusPanel.render();
      } else if (this.mode === DashboardMode.CMD) {
        this.cmdPanel.render();
      } else {
        this.statusPanel.render();
      }

      if (!Dashboard.toggleDebug) {
        this.debugLog.hide();
        this.debugLog.setBack();
        this.cmdPanel.updateVis();
      } else {
        this.debugLog.show();
        this.debugLog.setFront();
        this.cmdPanel.updateVis();
      }

      this.splitter.setFront();
      this.statusBar.setFront();
      this.splitter.render();

      this.statusBar.show();

      this.menu.setFront();
      this.redraw();
    }
  }

  resizeMode(tableCalcs = undefined) {
    const screenHeight = this.screen.height - 1;
    const top = 2;
    const panelWidth = this.screen.width - tableCalcs.tableWidth - 2;

    this.statusPanel.set(tableCalcs.tableWidth + 1, panelWidth + 1, top, screenHeight);
    this.cmdPanel.set(tableCalcs.tableWidth + 1, panelWidth + 1, this.statusPanel.bottom, screenHeight);

    this.splitter.height = this.screen.height - 2;
  }

  resizeWidgets(tableCalcs = undefined) {
    if (!tableCalcs) {
      tableCalcs = this.calcTableInfo();
    }
    this.packages.width = tableCalcs.tableWidth;
    this.packages.top = 0;
    this.packages.height = Package.getPackages().length + 5;

    const screenHeight = this.screen.height - 1;

    this.status.left = 0;
    this.debugLog.left = this.packages.width + 1;
    this.debugLog.width = this.screen.width - this.packages.width;
    this.debugLog.top = this.statusPanel.bottom.top;
    this.debugLog.height = screenHeight - this.debugLog.top;

    const fifthHeight = Math.floor(screenHeight / 5);
    const parameterHeight = Math.floor((screenHeight - fifthHeight - StatusPanel.modulesHeight + 1) / 2) - 1;

    this.resizeMode(tableCalcs);

    this.status.top = this.packages.height;
    this.status.height = screenHeight - this.status.top;
    this.status.width = this.packages.width;


    this.splitter.left = this.tableWidth;
    this.packageBox.left = this.packages.width;
    this.packageBox.top = 1;
    this.packageBox.setFront();
    this.packageBox.show();
    this.statusBar.width = this.screen.width;
    this.statusBar.position.top = this.screen.height - 1;
    this.splitter.setFront();
    this.statusBar.setFront();
    this.screen.clearRegion(0, this.screen.width, 0, screenHeight);
  }

  initialWidth = -1;
  calcTableInfo() {
    let tableWidth = this.maxColumnWidth;
    if (this.splitter.left > tableWidth) {
      this.splitter.left = tableWidth;
    }

    if (!this.blessedDeps.splitterOverride) {
      this.blessedDeps.splitterOverride = this.maxColumnWidth;
    } else {
      tableWidth = this.blessedDeps.splitterOverride;
    }

    let columns = this.columnWidth.length;

    if (tableWidth > this.maxColumnWidth) {
      tableWidth = this.maxColumnWidth;
    } else {
      columns = 1;
      let stopGrowing = false;
      const nextWidth = this.priorityColumnWidth.reduce(
        function (a, b, i) {
          const nextValue = a + b + this.columnSpacing / 2;
          if (nextValue > this.splitter.left || stopGrowing) {
            stopGrowing = true;
            return a;
          }
          columns++;
          return nextValue;
        }.bind(this),
      );
      if (!this.blessedDeps.splitterOverride) {
        tableWidth = nextWidth;
      }
    }
    if (this.initialWidth === -1) {
      tableWidth = this.maxColumnWidth;
      this.initialWidth = this.maxColumnWidth;
    }
    this.tableWidth = tableWidth;

    return { tableWidth, columns };
  }

  destroy() {
    this.screen?.destroy();
  }

  redraw() {
    this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
  }

  hide() {
    this.hidden = true;
    this.packages.hide();
    this.splitter.hide();
    this.status.hide();
    this.statusBar.hide();
    this.cmdPanel.hide();
    this.statusPanel.hide();
  }

  show() {
    this.hidden = false;
    this.grid.show();
    this.packages.show();
    this.splitter.show();
    this.status.show();
    this.statusBar.show();
    this.cmdPanel.show();
    this.statusPanel.show();
  }
}
