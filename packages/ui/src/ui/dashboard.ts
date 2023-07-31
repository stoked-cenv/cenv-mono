import {blessed, contrib, getBlessedDeps} from './blessed';
import Dialogs from './dialogs';
import Menu from './menu';
import {
  CenvLog,
  clamp,
  Cmd,
  colors,
  DashboardCreateOptions,
  deleteStack,
  Deployment,
  EnvironmentStatus,
  execCmd,
  getPkgContext,
  killRunningProcesses,
  killStackProcesses,
  Package,
  PackageCmd,
  pbcopy,
  PkgContextType,
  ProcessMode,
  ProcessStatus,
  validateBaseOptions,
  PkgSummary
} from "@stoked-cenv/lib";
import CmdPanel from './cmdPanel';
import StatusPanel from './statusPanel';
import {ChalkFunction} from 'chalk';
import chalk from 'chalk'
import {isFunction} from "lodash";
import {HelpUI} from "./help";
import Groups from "./group";

export enum ModuleDeployMode {
  ALL, PARAMETERS, STACK, DOCKER, NONE
}

export enum DashboardMode {
  MIXED = 'MIXED',
  WIDE_CMD_FIRST = 'WIDE_CMD_FIRST',
  WIDE_STATUS_FIRST = 'WIDE_STATUS_FIRST',
  CMD = 'CMD',
  STATUS = 'STATUS'
}


export interface Click {
  ts: number,
  x: number,
  y: number
}

export class Dashboard {

  // static state
  static toggleDebug = false;
  static instance?: Dashboard = undefined;
  static stackName = 'GLOBAL';
  static moduleToggle = true;
  static dependencyToggle = true;
  static paramsToggle = false;
  static horizontalSplitterUserCtrl = false;
  static enableMenuCommands = true;

  // widgets
  screen: blessed.Screen;
  statusOptions?: Menu;
  cmdPanel?: CmdPanel;
  statusPanel?: StatusPanel;
  menu?: Menu;

  initialized = false;
  debugLog;
  status;
  statusPanelText = '';
  debugStr = '';
  complete = false;
  packages;
  grid: any;
  cmd?: ProcessMode = undefined;
  focusIndex = -1;
  focusedBox;
  priorityColumnWidth: any = [];
  columnWidth: number[] = this.defaultColumnWidth;
  columnSpacing = 2;
  maxColumnWidth: number = this.defaultColumnWidth.reduce((sum, a) => sum + a, 0);
  minColumnWidth = 12;
  tableWidth = 0;
  splitter: any;
  suite: string | undefined;
  environment;
  packageBox;
  statusBar;
  packageTs: number | undefined;
  mode: DashboardMode = DashboardMode.MIXED;
  modeLastWide: DashboardMode = DashboardMode.WIDE_CMD_FIRST;
  modeLast: DashboardMode = DashboardMode.MIXED;
  dependencies = '';
  cmdOptions: any;
  selectedPackage?: Package;
  selectedRowFg?: number[] = undefined;
  selectedPackageFg = [14, 221, 14];
  selectedFullPackageFg = [40, 40, 40];
  selectedPackageFgHover = [20, 20, 20];
  selectedPackageBg = [65, 65, 65];
  selectedFullPackageBg = [14, 221, 14];
  selectedPackageBgHover = [24, 255, 24];
  selectedFullPackageBgHover = [24, 255, 24];
  packageBgHover = [15, 40, 15];
  hoverRowIndex = -1;
  selectedRowIndex = -1;
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
  packageHover = false;
  view = 'mixed';
  blessedDeps;
  fullScreenCtrl: any;
  hidden = false;
  processOptions;
  debounceFlags: Record<string, any> = {};
  //clickQueue: Queue<Click> = new Queue<Click>();
  clearLabelTimeout?: NodeJS.Timeout = undefined;
  deploying = false;

  clickQueue: Click[] = [];
  moduleDeployMode = ModuleDeployMode.ALL;
  titleContext: Package[] = [];
  lastSelectedFully = false;
  maxProcessOptionsHeight = 34;
  autoHidePanelHeight = true;
  minimizeStatusPanel = false;

  constructor(dashboardOptions: DashboardCreateOptions) {
    try {

      this.cmdOptions = dashboardOptions.options;
      this.blessedDeps = getBlessedDeps();
      this.blessedDeps.dashboard = this;
      this.createBaseWidgets();
      this.cmdPanel = new CmdPanel(this);
      this.statusPanel = new StatusPanel(this);

      if (Dashboard.instance) {
        CenvLog.single.catchLog('attempted to initialize the dashboard twice');
        process.exit(349);
      }

      this.suite = dashboardOptions?.options?.suite ? dashboardOptions?.options?.suite : undefined;
      this.environment = dashboardOptions?.options?.environment;
      this.cmd = dashboardOptions?.cmd;


    } catch (e) {
      CenvLog.single.catchLog(e);
    }

    try {
      //this.global();
      this.packageBox = this.grid.set(0, 0, 1, 2, blessed.widget.Box, {
        mouse: true, keys: true, interactive: true, fg: 'white', label: 'package', style: {
          fg: 'white', bg: 'black', bold: true, border: {fg: 'black'}, label: {bold: true},
        }, border: false, transparent: true, height: 1, hideBorder: true,
      });

      const pkgButtons = {
        deploy: {
          keys: ['d'], callback: () => {
            this.debounceCallback('deploy', async () => {
              await this.launchDeployment(ProcessMode.DEPLOY);
            });
          }
        }, synth: {
          keys: ['s'], callback: () => {
            this.debounceCallback('synth', async () => {
              const pkgs = this.getContext();
              if (!pkgs) {
                return;
              }
              await Promise.all(pkgs.map(async (p: Package) => await p.stack?.synth()));
            });
          }
        }, destroy: {
          keys: ['y'], callback: () => {
            this.debounceCallback('destroy', async () => {
              const pkgs = this.getContext();
              if (!pkgs) {
                return;
              }
              const packages = pkgs.length > 1 ? `${pkgs.length} packages` : `${pkgs[0].packageName}`;
              this.setStatusBar('launchDestroy', this.statusText(`destroy`, packages),);
              await this.launchDeployment(ProcessMode.DESTROY);
            });
          }
        },

        build: {
          keys: ['b'], callback: () => {
            this.debounceCallback('build', async () => {
              const ctx = this.getContext(PkgContextType.COMPLETE, false);
              if (!ctx || !ctx.length) {
                return;
              }
              const name = 'build';
              this.setStatusBar(name, this.statusText(name, ctx.length > 1 ? `${ctx.length} packages` : ctx[0].packageName));
              await Promise.all(ctx?.map(async (p: Package) => await p?.lib?.build(false, true)));
            });
          }
        }, "status": {
          keys: ['enter'], callback: () => {
            const ctx = this.getContext(PkgContextType.COMPLETE, false);
            if (!ctx?.length) {
              return;
            }
            const packages = ctx.length > 1 ? `${ctx.length} packages` : `${ctx[0]?.packageName?.toUpperCase()}`;
            this.setStatusBar('checkStatus', this.statusText('status check', `check deployment status of ${packages}`),);
            ctx.filter((p: Package) => !p.isGlobal).map(async (p: Package) => await p.checkStatus(Deployment?.mode()?.toString(), ProcessStatus.COMPLETED));
          }
        }, cancel: {
          keys: ['c'], callback: () => {
            const ctx = this.getContext(PkgContextType.PROCESSING, false);
            if (!ctx) {
              return;
            }
            this.debounceCallback('cancel', async () => {
              await Promise.allSettled(ctx.map(async (p: Package) => {
                CenvLog.single.stdLog(Deployment.logStatusOutput('current deployment test', this.cmdPanel?.stdout), p.stackName);

                const complete = await Deployment.packageComplete(p);
                if (complete) {
                  Package.global.timer?.stop();
                }

                if (Deployment.dependencies) {
                  Object.keys(Deployment.dependencies).map(stackName => {
                    Deployment.dependencies[stackName].dependencies = Deployment.dependencies[stackName].dependencies.filter((d: Package) => d.stackName !== p.stackName);
                  })
                }

                if (Deployment.toProcess && Deployment.toProcess[p.stackName]) {
                  delete Deployment.toProcess[p.stackName];
                }
                p.processStatus = ProcessStatus.CANCELLED;
                await killStackProcesses(p.stackName)
              }));

              this.setStatusBar('cancel deploy', `cancel ${ctx.length === 1 ? ctx[0].packageName : ctx.length + ' packages (does not cancel cloudformation)'}`);
            });
          }
        }, "kill hard": {
          keys: ['C-k'], callback: () => {
            this.debounceCallback('hard kill', async () => {
              const ctx = this.getContext();
              if (!ctx) {
                return;
              }
              if (ctx.length !== 1) {
                this.setStatusBar('kill hard fail', this.statusText('kill hard failure', 'the kill hard command only works one package at a time'));
                return;
              }

              Dialogs.yesOrNoDialog(`The stack [${ctx[0].stackName}] will be deleted It's current status is ${ctx[0].stack?.detail?.StackStatus}. Are you sure you want to destroy this stack?`,  async (killIt: boolean) => {
                const service = ctx[0].stackName;
                if (killIt) {
                  this.setStatusBar('kill hard', this.statusText('kill hard', service));
                  await deleteStack(ctx[0].stackName);
                }
              });

            });
          }
        },
      }

      this.processOptions = new Menu(this.screen, pkgButtons, {top: 0, left: 0, right: 0});
      this.statusBar = this.grid.set(5, 0, 1, 2, blessed.box, {
        fg: 'white', label: '', style: {
          fg: 'white', bg: 'pink', label: {},
        }, height: 1, hideBorder: true,
      });


      this.statusBar.on('click', (data: any) => {
        if (!process.env.DEBUG_MODE) {
          const click: Click = {ts: Date.now(), x: data.x, y: data.y};
          this.clickQueue.unshift(click);
          if (this.clickQueue.length > 4) {
            this.clickQueue.pop()
          }
          if (this.clickQueue.length) {
            if (this.clickQueue[0]) {
              CenvLog.info(`click.ts: ${click.ts}, ${this.clickQueue[0].ts}, ${this.clickQueue.length}`)
            }
            //          CenvLog.info(`${Math.abs(click.ts - this.clickQueue[0].ts)}`)
            if (Math.abs(click.ts - this.clickQueue[0].ts) < 300) {
              CenvLog.info(`statusBar::click() - ${JSON.stringify(click, null, 2)}`);
              this.debounceCallback('deploy', async () => {
                await execCmd('/', `open -a "Google Chrome" ${Package.fromStackName(Dashboard.stackName).getConsoleUrl()}`)
              });
            }
          }
        }
      });

      this.statusBar.on('render', () => {
        Dialogs.setFront();
        Dialogs.render();
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
          border: {fg: [24, 242, 24]},
        },
      });

      this.packages.name = 'packages';
      this.packages.rows.name = 'packageRows';
      this.packages.rows.items.name = 'packageItems';

      this.packageHover = false;

      this.packages.on('element mouseover', async (el: any) => {
        try {
          if (el.parent?.name !== 'packageRows') {
            return;
          }

          const stackNameVis = blessed.helpers.cleanTags(el.content).split(' ')[0];
          if (!stackNameVis) {
            return;
          }

          const pkg = Package.getPackageFromVis(stackNameVis);
          if (pkg) {
            this.setStatusBar(pkg.getConsoleUrl())
          }
          if (this.packages.rows.items[this.selectedRowIndex] === el) {
            this.hoverRowIndex = this.selectedRowIndex;
          } else {
            this.hoverRowIndex = this.packages.rows.getItemIndex(el);
          }

          await this.update();
        } catch (ex) {
          console.log('################', ex)
        }
      });

      this.packages.on('element mouseout', (el: any) => {
        if (el.parent?.name !== 'packageRows') {
          return;
        }

        el.render();
      });


      this.maxColumnWidth = this.defaultColumnWidth.reduce(function (a, b) {
        return a + b;
      }) - 1;
      this.maxColumnWidth += (this.columnSpacing / 2) * this.columnWidth.length;


      for (let i = 0; i < this.defaultColumnWidth.length; i++) {
        this.priorityColumnWidth.push(this.defaultColumnWidth[this.columnPriority.indexOf(i)]);
      }

      this.focusedBox = this.packages;
      const debugPackageEvents = process.env.CENV_DEBUG_PACKAGE_EVENTS;
      this.packages.rows.on('move', async function move(item: any, index: number) {
        if (debugPackageEvents) {
          Dashboard.debug('move', index.toString());
        }
      });

      this.packages.rows.on('action', async (var1: any, var2: any) => {
        if (debugPackageEvents) {
          Dashboard.debug('rows action', var2);
        }
        if (var2 !== undefined) {
          this.selectedFully = true;
        }
      });

      this.packages.on('element click', async (var1: any, var2: any) => {
        if (debugPackageEvents) {
          Dashboard.debug('packages element click', var1, var2);
        }
        await this.selectPackage();
      });

      this.packages.on('click', async (var1: any, var2: any) => {
        if (debugPackageEvents) {
          Dashboard.debug('packages click', var1, var2);
        }
      });

      this.packages.on('click select', async (var1: any, var2: any) => {
        if (debugPackageEvents) {
          Dashboard.debug('package click select', var1, var2);
        }
      });

      this.packages.on('select item', async (var1: any, var2: any) => {
        if (debugPackageEvents) {
          Dashboard.debug('package select item', var1, var2);
        }
      });

      this.packages.rows.on('click', async (var1: any, var2: any)=> {
        if (debugPackageEvents) {
          Dashboard.debug('rows click', var1, var2);
        }
      });

      this.packages.rows.on('click select', async (var1: any, var2: any) => {
        if (debugPackageEvents) {
          Dashboard.debug('rows click select', var1, var2);
        }
      });

      this.packages.rows.on('select item', async (var1: any, var2: any) => {
        if (debugPackageEvents) {
          Dashboard.debug(`select item - selected index: ${var2}, selectedRowIndex: ${this.selectedRowIndex}, full: ${this.selectedFully}`);
        }
        await this.selectPackage();
      });

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
          ch: ' ', inverse: true,
        },
        style: {
          fg: 'white', bg: 'black', border: {fg: 'gray'},
        },
        autoScroll: true,
      });
      this.debugLog.setContent('');

      this.status = this.grid.set(5, 0, 1, 2, blessed.text, {
        vi: true, fg: 'white', label: 'stdout', tags: true, keys: true, mouse: true, scrollable: true, scrollbar: {
          ch: ' ', inverse: true,
        }, style: {
          fg: 'white', bg: 'black', border: {fg: 'gray'}, label: {fg: 'gray'}
        }, autoScroll: false, padding: {left: 2, right: 2, top: 0, bottom: 0}
      });

      this.status.enableDrag = () => {
        // do nothing..
      }

      this.status.setContent('');

      this.screen.key('backspace', async(ch: any, key: any) => {
        /*if (!this.statusPanel?.enableSelection || this.focusedBox.type !== 'params') {
          return;
        }
        const pkg = this.getPkg();
        const typedVars = pkg.params?.localVarsTyped;
        if (typedVars) {
          delete typedVars[this.focusedBox.name][this.statusPanel.selectedParamKey];
          const vars: any = {};
          vars[this.focusedBox.name] = typedVars[this.focusedBox.name];
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
          CenvFiles.SaveVars(vars, process.env.ENV!, false);
        }

        await CenvParams.removeParameters([this.statusPanel.selectedParamKey], {}, [this.focusedBox.name]);
        await this.statusPanel.updateParams(pkg);

         */
      });

      this.screen.key(['escape', 'q', 'C-c'], (ch: any, key: any) => {
        if (Dialogs.open()) {
          Dialogs.close();
        } else if (HelpUI.instance) {
          this.show();
        } else {
          this.screen.destroy();
          killRunningProcesses();
          return process.exit(0);
        }
      });

      this.screen.key(['f'],(ch: any, key: any) => {
        if (!this.fullScreenCtrl) {
          this.fullScreenCtrl = this.focusPool[this.focusIndex];
        } else {
          this.fullScreenCtrl = undefined;
        }
      })

      this.screen.key(['ç'], () => {
        if (this.focusIndex === 0) {
          let text = Dashboard.stackName + ':\n';
          text += Package.fromPackageName(Dashboard.stackName).cmds.map((cmd: PackageCmd) => this.printCmd(cmd),);
          pbcopy(blessed.helpers.cleanTags(text));
        } else if (this.focusIndex === 1) {
          pbcopy(blessed.helpers.cleanTags(this.printCmd(Package.fromPackageName(Dashboard.stackName).cmds[this.cmdPanel?.cmdList.selected],)));
        } else if (this.focusIndex === 2) {
          pbcopy(blessed.helpers.cleanTags(Package.fromPackageName(Dashboard.stackName).cmds[this.cmdPanel?.cmdList.selected].stdout));
        } else if (this.focusIndex === 3) {
          pbcopy(blessed.helpers.cleanTags(this.statusPanel?.dependencies.getText()));
        }
      });

      /*this.screen.key(
        ['C-s'],
        async(ch: any, key: any) => {
          Dialogs.saveSuiteDialog(this.screen);
        }
      );

      this.screen.key(
        ['C-d'],
        async(ch: any, key: any) => {
          //Dialogs.saveDump(this.screen);
        }
      );*/

      this.screen.key(['tab'],(ch: any, key: any) => {
        const isLastIndex = this.focusIndex + 1 > this.focusPool.length - 1;
        const newIndex = isLastIndex ? 0 : this.focusIndex + 1;
        this.setFocusIndex(newIndex);
      });

      this.screen.key(['S-tab'],(ch: any, key: any) => {
        const newIndex = this.focusIndex - 1 < 0 ? this.focusPool.length - 1 : this.focusIndex - 1;
        this.setFocusIndex(newIndex);
      });

      this.screen.key(['+'], () => {
        Groups.toggleFullscreen();
      });

      this.splitter = blessed.box({
                                    parent: this.screen,
                                    left: 'center',
                                    top: 'center',
                                    width: 1,
                                    // position: {left: this.maxColumnWidth - 1},
                                    height: '100%',
                                    style: {
                                      bg: [50, 50, 50], //transparent: true,
                                    },
                                    draggable: true,
                                  });

      this.screen.on('resize', () => {
        this.updateVis();
      });

      const commandButtons = {
        /*

                bump: {
                  keys: ['b'],
                  callback: () => {
                    debounceCallback('bump', async () => {
                      function getBumpText() {
                        const bumpType = Version.bumpTypeText;
                        const bumpMode = Version.bumpModeText;
                        const ctx = getPkgCompleteContext();
                        if (!ctx) {
                          dashboard.setStatusBar('invalid state', 'at least one package is in an invalid state');
                          return;
                        }
                        const packages =
                          ctx.packages.length > 1
                            ? `${ctx.packages.length} package version numbers`
                            : '1 package version number';
                        const packages2 =
                          ctx.packages.length > 1
                            ? `${ctx.packages.length} packages`
                            : `1 package`;
                        switch (bumpType) {
                          case BumpType.BUMP:
                            return this.statusText(
                              `${bumpType} builds`,
                              `increment ${packages} by ${bumpMode} if changes detected`,
                            );
                          case BumpType.DECREMENT:
                            return this.statusText(
                              `${bumpType} builds`,
                              `decrement ${packages} by ${bumpMode} if changes detected`,
                            );
                          case BumpType.FINALIZE_PRERELEASE:
                            return this.statusText(
                              `${bumpType}`,
                              `remove ${bumpMode} build identifiers from ${packages2} if they exist`,
                            );
                        }
                      }

                      dashboard.setStatusBar('bumpAction', getBumpText());
                    });
                  }
                },
                'next bump mode': {
                  keys: ['C-b'],
                  callback: () => {
                    debounceCallback('nextBumpMode', async () => {
                      const nextMode = Version.nextBumpMode;
                      dashboard.setStatusBar(
                        'nextBumpMode',
                        this.statusText(`cycle bump mode`, `${nextMode} enabled`),
                      );
                    });
                  }
                },
                'next bump type': {
                  keys: ['S-b'],
                  callback: () => {
                    debounceCallback('nextBumpType', async () => {
                      const nextType = Version.nextBumpType;
                      dashboard.setStatusBar(
                        'nextBumpMode',
                        this.statusText(`cycle bump type`, `${nextType}`),
                      );
                    });
                  }
                },
                'next color': {
                  keys: ['n'],
                  callback: function() {
                    debounceCallback('nextColor', async () => {
                      CenvLog.nextColor();
                      dashboard.setStatusBar(
                        'nextColor',
                        this.statusText(
                          `active color`,
                          `${CenvLog.getRgb()}`,
                        ),
                      );
                    })
                  }
                },
                'increment color': {
                  keys: ['m'],
                  callback: function() {
                    debounceCallback('incrementColor', async () => {
                      CenvLog.incrementColor();
                      dashboard.setStatusBar(
                        'incrementColor',
                        this.statusText(
                          `increment ${CenvLog.getRgb()}`,
                          `${CenvLog[CenvLog.getRgb()]}`,
                        ),
                      );
                    })
                  }
                },
                'clear versions': {
                  keys: ['o'],
                  callback: () => {
                    debounceCallback('clearVersions', async () => {
                      const ctx = getPkgCompleteContext();
                      const packages =
                        ctx.packages.length > 1
                          ? `${ctx.packages.length} packages`
                          : `${ctx.packages[0].packageName.toUpperCase()}`;
                      dashboard.setStatusBar(
                        'resetBump',
                        this.statusText(
                          `reset bump versions`,
                          `remove all bump versions from ${packages}`,
                        ),
                      );
                      await Version.Bump(ctx.packages, 'reset');
                    });
                  }
                },
                */
        help: {
          keys: ['h'], callback: () => {
            this.hide();
            new HelpUI();
          }
        }, debug: {
          keys: ['x'], callback: () => {
            this.debounceCallback('toggle debug', async () => {
              Dashboard.toggleDebug = !Dashboard.toggleDebug;
              this.setStatusBar('toggleDebug', this.statusText(Dashboard.toggleDebug ? `toggle debug view` : `toggle status view`, Dashboard.toggleDebug ? `debug view enabled` : `status view enabled`));
            });
          }
        }, /*
        "save dump": {
          keys: ['s'],
          callback: () => {
            this.debounceCallback('create dump', async () => {
              this.setStatusBar(
                'createDump',
                this.statusText(
                  'log dump',
                  `generate a log dump for all packages currently loaded`,
                ),
              );
              Dialogs.saveDump(this.screen);
              this.screen.render();
            });
          }
        },

        "fix dupes": {
          keys: ['u'],
          callback: () => {
            try {
              const name = 'fix param dupes';
              this.debounceCallback(name, async () => {
                const ctx = this.getContext();
                if (!ctx) {
                  return;
                }
                for (let i = 0; i < ctx.length; i++) {
                  await ctx[i].params?.fixDupes();
                }
                //await Promise.all(ctx?.map(async (p: Package) => await p?.params?.fixDupes()));
                this.setStatusBar(name, this.statusText(name, 'remove dupes for global and globalEnv param blessed'));
              });
            } catch (e) {
              CenvLog.single.catchLog(e);
            }
          }
        },*/
        "strict versions": {
          keys: ['S-v'], callback: () => {
            this.debounceCallback('strictVersions', async () => {
              if (Deployment?.options) {
                Deployment.options.strictVersions = !Deployment.options?.strictVersions;
                this.setStatusBar('toggleView', this.statusText('strict versions mode', Deployment.options.strictVersions ? 'enabled' : 'disabled',),);
              }
            });
          }
        }, "clear logs": {
          keys: ['l'], callback: () => {
            this.debounceCallback('clear logs', async () => {
              const ctx = this.getContext();
              if (!ctx) {
                return;
              }
              if (Dashboard.stackName === 'GLOBAL') {
                ctx.push(Package.global)
              }
              ctx.map((p: Package) => {
                p.cmds = [];
              })
              Dashboard.dependencyToggle = true;
              Dashboard.paramsToggle = true;
              Dashboard.moduleToggle = true;
              this.cmdPanel?.stdout.setContent('');
              this.cmdPanel?.stderr.setContent('');
              this.cmdPanel?.cmdList.setItems([]);
              CenvLog.single.infoLog('clear all logs');
              this.setStatusBar('clear logs', this.statusText('clear logs', ctx.length > 1 ? `${ctx.length} packages` : ctx[0].packageName));
            });
          }
        }, "clear debug": {
          keys: ['C-d'], callback: () => {
            this.debounceCallback('clearVersions', async () => {
              if (this.focusedBox === this.cmdPanel?.stdout) {
                this.cmdPanel?.stdout.setContent('');
                this.setStatusBar('clearStdout', this.statusText('clear', 'stdout panel'));
              } else if (this.focusedBox === this.cmdPanel?.stderr) {
                this.cmdPanel?.stderr.setContent('');
                this.setStatusBar('clearStderr', this.statusText('clear', 'stderr panel'));
              } else {
                this.debugLog.setContent('');
                this.setStatusBar('clearDebug', this.statusText('clear', 'debug log'));
              }
            });
          }
        }, "cycle module deploy mode": {
          keys: ['S-m'], callback: () => {
            this.debounceCallback('clearVersions', async () => {
              this.moduleDeployMode++;
              if (this.moduleDeployMode > 4) {
                this.moduleDeployMode = 0;
              }
              switch (this.moduleDeployMode) {
                case ModuleDeployMode.ALL:
                  Deployment.options.parameters = Deployment.options.stack = Deployment.options.docker = true;
                  break
                case ModuleDeployMode.PARAMETERS:
                  Deployment.options.parameters = true;
                  Deployment.options.stack = Deployment.options.docker = false;
                  break
                case ModuleDeployMode.STACK:
                  Deployment.options.parameters = Deployment.options.docker = false;
                  Deployment.options.stack = true;
                  break;
                case ModuleDeployMode.DOCKER:
                  Deployment.options.parameters = Deployment.options.stack = false;
                  Deployment.options.docker = true;
                  break;
                case ModuleDeployMode.NONE:
                  Deployment.options.none = true;
                  Deployment.options.parameters = Deployment.options.stack = Deployment.options.docker = false;
                  break;
              }
              this.setStatusBar('cycle module deploy mode', this.statusText('cycle module deploy mode', Object.values(ModuleDeployMode)[this.moduleDeployMode].toString().toLowerCase() + ' mode'), 1000, 1000);
            });
          }
        }, force: {
          keys: ['S-f'], callback: () => {
            this.debounceCallback('forceMode', async () => {
              Deployment.options.force = !Deployment.options.force;
              this.setStatusBar('toggle force mode', this.statusText('toggle force mode', 'force mode ' + (Deployment.options.force ? 'enabled' : 'disabled')));
            });
          }
        },
      }

      this.menu = new Menu(this.screen, commandButtons, {bottom: 0, left: 0, right: 0});

      const statusButtons = {
        modules: {
          keys: ['m'], callback: () => {
            this.debounceCallback('modules', async () => {
              Dashboard.moduleToggle = !Dashboard.moduleToggle;
              if (this.screen.height < this.maxProcessOptionsHeight) {
                this.autoHidePanelHeight = false;
              }
              this.statusPanel?.updateVis();
              this.setStatusBar('toggle panel', this.statusText(`toggle panel`, 'module info'));
            });
          }
        }, dependencies: {
          keys: ['e'], callback: () => {
            this.debounceCallback('toggle dependencies', async () => {
              Dashboard.dependencyToggle = !Dashboard.dependencyToggle;
              if (this.screen.height < this.maxProcessOptionsHeight) {
                this.autoHidePanelHeight = false;
              }
              this.statusPanel?.updateVis();
              this.setStatusBar('toggle panel', this.statusText(`toggle panel`, 'dependencies'));
            });
          }
        }, params: {
          keys: ['p'], callback: () => {
            this.debounceCallback('toggle params', async () => {
              Dashboard.paramsToggle = !Dashboard.paramsToggle;
              if (this.screen.height < this.maxProcessOptionsHeight) {
                this.autoHidePanelHeight = false;
              }
              this.resizeWidgets(this.calcTableInfo());
              await this.statusPanel?.updatePackage();
              this.setStatusBar('toggle panel', this.statusText(`toggle panel`, 'params'));
            });
          }
        },
      }

      this.statusOptions = new Menu(this.statusPanel?.screen, statusButtons, {top: 0, left: 0, right: 0});
      this.packages.focus();
      this.statusPanel?.init();
      this.cmdPanel?.init();

      this.setMode(this.mode);

      // main dashboard upload loop
      setInterval(async ()=> {
        await this.update();
      }, 25);

      if (!this.cmd) {
        setTimeout(async function init() {
          await Package.checkStatus(ProcessMode.DEPLOY.toString(), ProcessStatus.COMPLETED);
        });
      }

      Dashboard.instance = this;
      this.initialized = true;

      this.debug('CENV_LOG_LEVEL=' + process.env.CENV_LOG_LEVEL)
      this.debug(`isVerbose=${CenvLog.single.isVerbose}`)
      this.debug(`isInfo=${CenvLog.single.isInfo}`)
      this.debug(`isDebug=${CenvLog.single.isAlert}`)
      this.debug(`isMinimal=${CenvLog.single.isStdout}`)
      this.debug(`isNone=${CenvLog.single.isNone}`)

    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  get tableHeaders() {
    return [' name', ' ver.', ' type', ' environment', ' process', ' time'];
  }

  get columnPriority() {
    return [0, 5, 4, 1, 2, 3];
  }

  get defaultColumnWidth() {
    return [Package.maxVisibleLength + 1, 12, 10, 13, 13, 10];
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

  static log(stackName: string, ...text: string[]) {
    Dashboard.instance?.log(stackName, ...text);
  }

  static logErr(stackName: string, ...text: string[]) {
    Dashboard.instance?.logErr(stackName, ...text);
  }

  static cleanTags(...text: string[]) {
    for (let i = 0; i < text.length; i++) {
      text[i] = blessed.helpers.cleanTags(text[i]);
    }
    return text;
  }

  static getFocusWidget() {
    return this.instance?.focusPool[this.instance.focusIndex];
  }

  statusText(titleText: string, descriptionText: string) {
    return `${chalk.blueBright.bold(titleText)}: ${descriptionText}`;
  }

  printCmd(cmd: Cmd) {
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

  async launchDeployment(mode: ProcessMode) {
    try {
      if (this.deploying) {
        return;
      }

      this.deploying = true;
      this.cmd = mode;

      const packages = this.getContext();
      if (!packages) {
        return;
      }

      this.titleContext = packages;
      const pkgText = packages.length === 1 ? `${packages[0].packageName}` : `${packages.length} packages`;
      const {parameters, stack, docker, none} = Deployment.options;
      const deploymentOptions: any = {parameters, stack, docker, none};
      if (Dashboard.enableMenuCommands) {
        //packages.map((p: Package) => p.processStatus = ProcessStatus.INITIALIZING)
        if (mode === ProcessMode.DESTROY) {
          this.setStatusBar('launchDeployment', this.statusText(`destroy`, `${pkgText}`));
          validateBaseOptions({packages, cmd: ProcessMode.DESTROY, options: deploymentOptions})
          await Deployment.Destroy(packages, {...Deployment.options, ...deploymentOptions});
        } else {
          this.setStatusBar('launchDeployment', this.statusText(`deploy`, `${pkgText}`));
          validateBaseOptions({packages, cmd: ProcessMode.DEPLOY, options: deploymentOptions})
          await Deployment.Deploy(packages, {...Deployment.options, ...deploymentOptions});
        }
      } else {
        setTimeout(() => {
          this.launchComplete()
        }, 10 * 1000)
        return;
      }
      this.launchComplete();
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  launchComplete() {
    this.titleContext = [];
    this.cmd = undefined;
    this.deploying = false;
  }

  getContext(type: PkgContextType = PkgContextType.COMPLETE, failOnInvalid = true) {
    const selectedPkg = this.getPkg();
    if (!selectedPkg) {
      return [];
    }
    const ctx = getPkgContext(selectedPkg, type, failOnInvalid);
    if (!ctx) {
      this.setStatusBar('invalid state', 'at least one package is in an invalid state');
      return [];
    }

    if (selectedPkg?.stackName === 'GLOBAL') {
      Deployment.options.dependencies = true;
    } else {
      Deployment.options.dependencies = false;
    }
    return ctx.packages;
  }

  debounceCallback(name: string, callback: any, onTimeout: any = undefined, ts = 2000) {
    if (this.debounceFlags[name]) {
      return;
    }
    callback();

    this.debounceFlags[name] = true;

    setTimeout(() => {
      delete this.debounceFlags[name];
    }, ts);

    this.clearLabelTimeout = setTimeout(() => {
      if (onTimeout) {
        onTimeout();
      }
    }, 2000);
  }

  isWideMode() {
    return [DashboardMode.WIDE_CMD_FIRST, DashboardMode.WIDE_STATUS_FIRST].indexOf(this.mode) > -1
  }

  useBothPanels(mode: DashboardMode = this.mode) {
    return [DashboardMode.WIDE_CMD_FIRST, DashboardMode.WIDE_STATUS_FIRST, DashboardMode.MIXED].indexOf(this.mode) > -1
  }


  getSelectedPackageRow() {
    return this.packages.rows.items[this.selectedRowIndex];
  }

  cyclePanelModes() {
    const nextMode = this.nextMode();
    this.setMode(nextMode);
    return nextMode;
  }

  logTemp(stackName: string, ...text: string[]) {
    if (process.env.CENV_STDTEMP) {
      stackName = blessed.helpers.cleanTags(stackName);

      const finalMsg = text.join(' ');
      this.storeLog(stackName, finalMsg, 'stdtemp');
      if (stackName !== Dashboard.stackName) {
        return;
      }
      this.cmdPanel?.out(stackName, finalMsg);

      //if (this.cmdPanel?.stdout?.hidden) {
      this.cmdPanel?.updateVis();
      //}
    } else {
      this.log(stackName, ...text);
    }
  }

  log(stackName: string, ...text: string[]) {
    stackName = blessed.helpers.cleanTags(stackName);

    const finalMsg = text.join(' ');
    this.storeLog(stackName, finalMsg, 'stdout');
    if (stackName !== Dashboard.stackName) {
      return;
    }
    this.cmdPanel?.out(stackName, finalMsg);

    //if (this.cmdPanel?.stdout?.hidden) {
    this.cmdPanel?.updateVis();
    //}
  }

  logErr(stackName: string, ...text: string[]) {
    stackName = blessed.helpers.cleanTags(stackName);
    //const finalMsg = text.map((t) => (t.endsWith('\n') ? t : t + '\n'))
    //.join(' ');
    const finalMsg = text.join(' ');
    this.storeLog(stackName, text.join(' '), 'stderr');
    if (stackName !== Dashboard.stackName) {
      return;
    }

    this?.cmdPanel?.err(stackName, finalMsg);
  }

  createBaseWidgets() {
    const title = this.getTitle();
    const screen = blessed.screen({
                                    smartCSR: true, autoPadding: true, warnings: true, title: title, cursor: {
        shape: 'line', artificial: true, blink: true, color: null, // null for default
      }
                                  });
    screen.render();
    this.screen = screen;

    //create layout and widgets
    this.grid = new contrib.grid({rows: 6, cols: 5, screen: this.screen});
  }

  getPackageRowName(index = this.packages?.rows?.selected) {
    const items = this.packages?.rows?.items;
    const itemsLength = items?.length;
    if (index > -1 && itemsLength && index < itemsLength) {
      return items[index].content.split(' ')[0];
    }
  }

  nextMode() {
    /*

      let foundMode = false;
      for (const value of enumKeys(DashboardMode) as keyof DashboardMode) {
        if (foundMode) {
          return DashboardMode[value as keyof typeof DashboardMode];
        }
        if (DashboardMode[value as keyof typeof DashboardMode] === this.mode) {
          foundMode = true;
        }
      }

     */
    return DashboardMode.MIXED;
  }

  setMode(mode: DashboardMode) {
    this.mode = mode;
    this.setPanels();
  }

  setPanels(mode: DashboardMode = this.mode) {
    this.cmdPanel?.updateVis();
    if (mode === DashboardMode.CMD) {
      this.statusPanel?.hide();
    } else {
      this.statusPanel?.updateVis();
    }
  }

  getTitle() {
    let titleNoun = 'ui';
    if (this.cmd !== undefined) {
      titleNoun = this.cmd.valueOf() === ProcessMode.DEPLOY.valueOf() ? 'deploy' : 'destroy';

      if (this.suite && Dashboard.stackName === 'GLOBAL') {
        titleNoun += ' ' + this.suite;
      } else if (this.titleContext) {
        this.titleContext = this.titleContext.filter((p: Package) => !Deployment.packageDone(p))
        let displayedContext = this.titleContext;
        let extraContext = '';
        if (this.titleContext?.length > 2) {
          displayedContext = this.titleContext.slice(0, 2);
          extraContext = ` ... (${this.titleContext.length} packages)`
        }
        titleNoun += ` ${displayedContext.map(p => p.packageName).join(' ')}${extraContext}`;
      }
    }

    return `[${process.env.ENV}] cenv${titleNoun ? ' ' + titleNoun : ''}`;

  }

  get focusPool() {
    let ctrls = [this.packages];
    const statusPool = this.statusPanel?.focusPool
    const cmdPool = this.cmdPanel?.focusPool

    if ([DashboardMode.MIXED, DashboardMode.WIDE_STATUS_FIRST].indexOf(this.mode) > -1) {
      if (this.statusPanel?.focusPool) {
        ctrls = ctrls.concat(statusPool);
      }
      if (this.cmdPanel?.focusPool) {
        ctrls = ctrls.concat(cmdPool);
      }
    } else if (this.mode === DashboardMode.WIDE_CMD_FIRST) {
      if (this.cmdPanel?.focusPool) {
        ctrls = ctrls.concat(cmdPool);
      }
      if (this.statusPanel?.focusPool) {
        ctrls = ctrls.concat(statusPool);
      }
    } else if (this.mode === DashboardMode.CMD) {
      if (this.cmdPanel?.focusPool) {
        ctrls = ctrls.concat(cmdPool);
      }
    } else if (this.mode === DashboardMode.STATUS) {
      if (this.statusPanel?.focusPool) {
        ctrls = ctrls.concat(statusPool);
      }
    }
    return ctrls;
  }

  setFocusIndex(index: number) {
    if (this.focusIndex === index) {
      return;
    }

    const focusItems = this.focusPool;
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
      if (this.focusedBox.type === 'params' && this.statusPanel) {
        this.focusedBox.rows.selected = -1;
        this.statusPanel.selectedParamKey = undefined;
        const textIndex = this.focusPool.indexOf(this.statusPanel.paramTextbox)

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

      this.focusedBox.focus();
    }

    this.focusIndex = index;
    this.screen.render();
  }

  getPkg(stackName?: string) {
    stackName = stackName ? stackName : Dashboard.stackName;
    if (!stackName) {
      return undefined;
    }
    return Package.fromStackName(stackName ? stackName : Dashboard.stackName);
  }

  storeLogBase(cmd: any, type: string, msg: string) {
    if (cmd[type]) {
      cmd[type] += msg;
    } else {
      cmd[type] = msg;
    }
    if (type === 'stdout' && !CenvLog.single.isInfo && process.env.CENV_STDTEMP) {
      this.storeLogBase(cmd, 'stdtemp', msg);
    }
  }

  storeLog(stackName: string, message: string, type: string) {
    if (!message) {
      return;
    }
    const pkg = this.getPkg(stackName);
    if (!pkg) {
      Dashboard.debug('stackName not found: ' + stackName + ' - ' + message, new Error().stack as string);
      return;
    }

    if (!pkg.cmds?.length) {
      pkg.createCmd('log');
    }

    let cmd = pkg.cmds[pkg.cmds.length - 1];

    if (!cmd.running) {
      //CenvLog.single.catchLog(new Error());
      pkg.createCmd('log');
      cmd = pkg.cmds[pkg.cmds.length - 1];
    }
    const finalMsg = message.endsWith('\n') ? message : message + '\n';
    this.storeLogBase(cmd, type, finalMsg);
  }

  async selectPackage() {
    try {

      const stackNameVis = blessed.helpers.cleanTags(this.getPackageRowName());
      if (stackNameVis === '') {
        return;
      }

      if (this.focusIndex !== 0) {
        this.setFocusIndex(0);
      }

      if (this.statusPanel && !this.statusPanel?.initialized) {
        this.statusPanel.initialized = true;
      }

      if (this.selectedRowIndex === this.packages.rows.selected) {
        if (this.menu && this.lastSelectedFully) {
          this.menu.show();
        }

        this.lastSelectedFully = this.selectedFully;
        return;
      }
      this.selectedPackage = Package.getPackageFromVis(stackNameVis);
      if (this.selectedPackage) {
        Dashboard.stackName = this.selectedPackage.stackName;
        const color = this.getStatusColor(this.selectedPackage.environmentStatusReal, true,) as ChalkFunction;
        let env = '';
        let envQuote = '';
        if (this.selectedPackage?.packageName !== 'GLOBAL') {
          env = ` [${color(this.selectedPackage?.environmentStatusReal)}]`;
          envQuote = this.packageHover ? ` - (${color(this.selectedPackage?.getEnvironmentStatusDescription())})` : '';
        }
        this.packageBox.setLabel(`${this.selectedPackage?.packageName}${env}${envQuote}\n\n`);

      }
      this.lastSelectedFully = false;
      this.selectedRowIndex = this.packages.rows.selected;
      this.selectedFully = false;

      //Dialogs.close(this.menu);
      this.menu?.hide();
      this.setPanels(this.mode);

      this.packageTs = Date.now();

      setTimeout(async () => {
        await this.statusPanel?.updatePackage();
        await this.cmdPanel?.updatePackage();
      }, 50);

      this.redraw();
      this.screen.render();
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  setStatusBar(name: string, msg?: string, exclusive = 3000, active = 5000) {

    if (!msg) {
      return;
    }
    this.statusBarInUse = true;
    this.statusBar?.setLabel(msg);

    setTimeout(() => {
      this.statusBarInUse = false;
    }, exclusive);

    if (this.clearLabelTimeout) {
      clearTimeout(this.clearLabelTimeout);
    }
    this.clearLabelTimeout = setTimeout(() => {
      this.statusBar.setLabel('');
    }, active);
  }

  getUpdatePackages() {

    const realPkgs = Package.getPackages(true);
    const pks: Package[] = realPkgs.filter((p: Package) => !p.skipUI || Deployment.toggleDependencies);
    const noGlobals = pks.filter(p => p.stackName !== 'GLOBAL');
    const upToDate = !noGlobals.filter(p => p.environmentStatus !== EnvironmentStatus.UP_TO_DATE).length;
    const notDeployed = !noGlobals.filter(p => p.environmentStatus !== EnvironmentStatus.NOT_DEPLOYED).length;
    const processing = !!noGlobals.filter(p => p.processStatus === ProcessStatus.PROCESSING).length;
    const statusCheck = !!noGlobals.filter(p => p.processStatus === ProcessStatus.STATUS_CHK).length;

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
    }

    let packages: PkgSummary[] = realPkgs.filter((p: Package) => !p.skipUI || Deployment.toggleDependencies)
      .map((p: Package) => {
      if (p.isGlobal) {
        return { ...p.summary, ...{ environmentStatus: envStatus, processStatus: processStatus } }
      }

      return p.summary
    });

    const environmentOrder = Object.values(EnvironmentStatus);
    const deploymentOrder = Object.values(ProcessStatus);
    const global = packages.filter((p: PkgSummary) => p.stackName === 'GLOBAL')[0];
    packages = packages
    .filter((p: PkgSummary) => p.stackName !== 'GLOBAL')
    .sort((a: PkgSummary, b: PkgSummary) => ((a?.statusTime ? a?.statusTime : 0) < (b?.statusTime ? b?.statusTime : 0) ? 1 : -1))
    .sort((a: PkgSummary, b: PkgSummary) => environmentOrder.indexOf(a.environmentStatus) - environmentOrder.indexOf(b.environmentStatus))
    .sort((a: PkgSummary, b: PkgSummary) => deploymentOrder.indexOf(a.processStatus) - deploymentOrder.indexOf(b.processStatus));
    packages.unshift(global)
    return packages;
  }

  async getUpdateData(packages: PkgSummary[]) {
    try {
      let complete = true;
      let hasNonGlobals = false;
      let selectedPos = -1;
      const tableCalcs = this.calcTableInfo();
      const headers: any[] = [tableCalcs.columns];
      const data: Array<string[]> = [];
      const selectedColor = chalk.rgb(this.selectedPackageFg[0], this.selectedPackageFg[1], this.selectedPackageFg[2],);
      const selectedHoverColor = chalk.rgb(this.selectedPackageFgHover[0], this.selectedPackageFgHover[1], this.selectedPackageFgHover[2],);

      const currentlySelected = {stackName: '', index: -1};
      for (let i = 0; i < packages.length; i++) {
        if (i === 0) {
          for (let j = 0; j < tableCalcs.columns; j++) {
            headers[this.columnPriority[j]] = this.tableHeaders[this.columnPriority[j]];
          }
        }
        const pkg: PkgSummary = packages[i];
        if (pkg.stackName === Dashboard.stackName && this.selectedRowIndex !== i) {
          selectedPos = i;
        }
        const global = pkg.stackName === 'GLOBAL';
        if (!global) {
          hasNonGlobals = true;
        }
        const isHoverRow = i === this.hoverRowIndex;
        const isSelectedRow = i === this.selectedRowIndex;
        const envColor = this.getStatusColor(pkg.environmentStatus, isHoverRow) as ChalkFunction;
        const processColor = this.getStatusColor(pkg.processStatus, isHoverRow) as ChalkFunction;
        if (!global) {
          complete = false;
        }

        const row: string[] = [];
        const selected = isSelectedRow;
        if (selected) {
          currentlySelected.stackName = pkg.stackName;
          currentlySelected.index = i;
        }

        if (pkg.stackName === Dashboard.stackName && this.selectedRowIndex !== i) {
          this.selectedRowIndex = i;
        }

        const hover = i === this.hoverRowIndex;
        let rowColor: any = envColor;
        if (pkg.stackName === 'GLOBAL') {
          rowColor = this.getChalkColor(this.yellow, false, 0, isHoverRow) as ChalkFunction;

        } else if (selected && hover) {
          rowColor = selectedHoverColor;
          this.selectedRowFg = this.getStatusColor(pkg.environmentStatus, isHoverRow, true) as number[];
        } else if (selected) {
          rowColor = selectedColor;
          this.selectedRowFg = this.getStatusColor(pkg.environmentStatus, isHoverRow, true) as number[];
        }

        if (!isFunction(rowColor)) {
          rowColor = chalk.rgb(rowColor[0], rowColor[1], rowColor[2])
        }
        row.push(rowColor(pkg.stackName));
        row.push(rowColor(global ? '-----' : pkg.version));
        row.push(rowColor(pkg.type));
        row.push(rowColor(pkg.environmentStatus));
        row.push(rowColor(pkg.processStatus));
        row.push(rowColor(pkg.timer));

        const finalRow: { [key: number]: any} = [];
        for (let j = 0; j < tableCalcs.columns; j++) {
          finalRow[this.columnPriority[j]] = row[this.columnPriority[j]];
        }

        data.push(Object.values(finalRow));
      }
      if (this.selectedRowIndex != this.packages.rows.selected) {
        this.packages.rows.select(this.selectedRowIndex)
      }
      return {data, complete: complete && hasNonGlobals, headers, tableCalcs};
    } catch (e) {
      CenvLog.single.catchLog(e)
    }
  }

  mod(digit: number, mod: number) {
    return clamp(Math.abs(255 - digit) < Math.abs(0 - digit) ? digit - mod : digit + mod, 0, 255,);
  }

  getChalkColor(colorRgb: number[], hover: boolean, sub: number, rgb: boolean) {
    const mod = hover ? 0 : sub;
    const r = this.mod(colorRgb[0], mod);
    const g = this.mod(colorRgb[1], mod);
    const b = this.mod(colorRgb[2], mod);

    if (rgb) {
      return [r, g, b];
    }
    const color = chalk.rgb(r, g, b);
    if (!hover) {
      return color.dim;
    }
    return color.bold;
  }

  /*
    static tabSpaces(text:) {
      const regex = /[\t]/g;
      return text.match(regex)?.length;
    }

   */

  getStatusColor(status: ProcessStatus | EnvironmentStatus, hover: boolean, rgb = false) {
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
    } else if (pkg?.meta?.data.deployDependencies) {
      const deps = pkg?.meta?.data.deployDependencies?.map((dep: Package) => {
        const color = this.getStatusColor(dep.environmentStatus, true) as ChalkFunction;
        return color(dep.packageName)
      }).join(', ');
      this.dependencies = deps;
    } else {
      this.dependencies = '';
    }
  }

  createBox(ctrl: any, title: string, lines: string[], bgColor: any, fgColor: any, topPadding = 1, sidePadding = 2) {
    const statWidth = ctrl.width - 3;
    const leftPadding = sidePadding + ctrl.padding.left;
    const tab = '----';
    const tabR = '0000';
    const rightPadding = sidePadding - 1 + ctrl.padding.right; // right side has 1 space automagically

    function boxLine(text = '') {
      text = tab + text;
      return `${' '.repeat(sidePadding)}${bgColor(`${text}${' '.repeat(clamp(statWidth - leftPadding - rightPadding - blessed.helpers.cleanTags(text).length, 0, 255))}`)}\n`
    }

    function spaceLeft(line: string) {
      return statWidth - line.length - leftPadding - rightPadding - tab.length;
    }

    try {
      lines = lines.map(l => blessed.helpers.cleanTags(l.replace(/\t/g, tabR)));

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
    } catch (e) {
      Package.global.err(e as string);
    }
  }

  statusMetric(num: number, type: string, longestNumberLength: number) {
    return `\t${chalk.bold(num.toString().padStart(longestNumberLength))} ${type}\n`
  }

  packageStatus(packages: Package[], environmentStatus: EnvironmentStatus) {
    const color = this.getStatusColor(environmentStatus, true) as ChalkFunction;
    const pkgs = packages.filter((p: Package) => p.environmentStatus === environmentStatus);
    return `[${color(environmentStatus)}]: ${chalk.bold(pkgs.length.toString())}\n${color(pkgs.map(d => d.packageName).join(', '))}\n\n`
  }

  updateStatus() {
    this.updateDependenciesStatus();

    const packages = Package.getPackages();
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
    const selectedPackage = Package.fromStackName(Dashboard.stackName);
    const validStatus = selectedPackage && Dashboard.stackName && Dashboard.stackName !== '' && [ProcessStatus.BUILDING, ProcessStatus.STATUS_CHK, ProcessStatus.INITIALIZING].indexOf(selectedPackage?.processStatus) === -1
    if ((multiplePackagesLoaded && Dashboard.stackName === 'GLOBAL') || !validStatus) {
      status += '\n';
      this.status.setLabel(noun);
      this.splitter.setFront();
      this.statusBar.setFront();
      const slices: Record<string, any> = {};

      const notSkipped = Package.getPackages().filter((p: Package) => !p.skipUI);
      slices['notSkipped'] = notSkipped;

      const skipped = Package.getPackages().filter((p: Package) => p.skipUI);
      slices['skipped'] = skipped;

      const cenvPackages = packages.filter((p: Package) => p.params?.hasCenvVars);
      slices['cenvPackages'] = cenvPackages;

      const cenvDeployedPackages = packages.filter((p: Package) => p.params?.hasCenvVars);
      slices['cenvDeployedPackages'] = cenvDeployedPackages;

      const cenvMaterializedPackages = packages.filter((p: Package) => p.params?.materializedVarsVersion)
      slices['cenvMaterializedPackages'] = cenvMaterializedPackages;

      const longestNumber: string = Object.values(slices).reduce(function (a: string, b: string) {
        return a.length > b.length ? a : b;
      }) as string;

      const longestNumberLength = longestNumber.length.toString().length;

      status += this.statusMetric(notSkipped.length, 'packages', longestNumberLength);
      if (skipped.length) {
        status += this.statusMetric(skipped.length, 'hidden packages (dependencies disabled)', longestNumberLength);
      }
      status += this.statusMetric(cenvPackages.length, 'packages w/ cenv vars', longestNumberLength);
      status += this.statusMetric(cenvDeployedPackages.length, 'packages w/ deployed vars', longestNumberLength);
      status += this.statusMetric(cenvMaterializedPackages.length, 'packages w/ materialized vars\n\n', longestNumberLength);


      status += this.packageStatus(packages, EnvironmentStatus.UP_TO_DATE);
      status += this.packageStatus(packages, EnvironmentStatus.NEEDS_UPDATE);
      status += this.packageStatus(packages, EnvironmentStatus.NEEDS_FIX);
      status += this.packageStatus(packages, EnvironmentStatus.NOT_DEPLOYED);

      if (!validStatus && selectedPackage && !selectedPackage.isGlobal) {
        status += `${selectedPackage.packageName}: ${selectedPackage.processStatus === ProcessStatus.STATUS_CHK ? 'checking status' : 'current status [' + selectedPackage.processStatus + ']'}`;
      }
    } else {
      if (validStatus) {
        const color = this.getStatusColor(selectedPackage.environmentStatus, true) as ChalkFunction;
        const colorDark = this.getStatusColor(selectedPackage.environmentStatus, false) as ChalkFunction;
        const env = selectedPackage.packageName !== 'GLOBAL' ? `[${color(selectedPackage.environmentStatus)}] ` : '';
        const envComment = selectedPackage.getEnvironmentStatusDescription();
        this.status.setLabel(`${chalk.bold(selectedPackage.packageName)} ${env}`);
        this.splitter.setFront();
        this.statusBar.setFront();

        if (selectedPackage.status?.needsFix?.length) {
          status += '\n' + this.createBox(this.status, 'NEEDS FIX', selectedPackage.status.needsFix, chalk.bgRed, chalk.whiteBright.underline);
        }
        if (selectedPackage.status?.incomplete?.length) {
          status += `\n${colors.error.underline.bold('NEEDS DEPLOY:')}\n\n`;
          status += `\t${selectedPackage.status.incomplete.join('\n\t')}\n`
        }
        if (selectedPackage.status?.deployed?.length) {
          status += `\n${colors.success.underline.bold('UP_TO_DATE:')}\n\n`;
          status += `\t${selectedPackage.status.deployed.join('\n\t')}\n\n`;
        }

        this.statusPanel?.dependencies.setContent(`${this.dependencies}\n\n`);
      } else {
        status += `${selectedPackage.packageName}: ${selectedPackage.processStatus === ProcessStatus.STATUS_CHK ? 'checking status' : 'current status [' + selectedPackage.processStatus + ']'}`;
      }
    }
    this.statusPanelText = status;
    this.status.setContent(this.statusPanelText);
    this.splitter.setFront();
    this.statusBar.setFront();
  }

  updatePackageVisuals() {
    if (this.packages?.rows?.items) {
      const global = Dashboard.stackName === 'GLOBAL';
      this.packages.rows.items.map((item: any, index: number) => {
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
      if (!this.initialized && !this.statusPanel?.initialized) {
        return;
      }

      if (Dashboard.stackName === '') {
        this.packages.rows.select(0);
      }

      this.updateStatus();
      this.updatePackageVisuals();

      const packages = this.getUpdatePackages();
      const resUpdate = await this.getUpdateData(packages);
      if (!resUpdate) {
        return;
      }
      const {data, complete, headers, tableCalcs} = resUpdate;

      if (complete) {
        this.complete = true;
      }

      if (Package.getPackages(true).length) {
        this.packages.rows.interactive = false;
        this.packages.setData({
                                headers: headers, data: data,
                              });
        this.packages.rows.interactive = true;
        if (this.packages?.headers) {
          this.packages.headers.name = 'headers';
        }

        if (!this.packages.rows.initialized) {
          this.packages.rows.initialized = true;
        }
        this.packages.rows.items.map((i: any, index: number) => {
          if (!i.initalized) {
            i.initalized = true;
            i.on('click', () => {
              this.packages.rows.focus();
              if (this.packages.rows.items[this.selectedRowIndex] === i) {
                this.packages.rows.emit('action', i, i.selected);
                this.packages.rows.emit('select', i, i.selected);
                return;
              }

              this.packages.rows.screen.render();
              this.packages.rows.emit('click select', i, index);
            });
          }
        });
      }

      if (this.selectedPackage?.stackName === 'GLOBAL' || this.screen.height < this.maxProcessOptionsHeight) {
        this.statusOptions?.hide();
      } else {
        this.statusOptions?.show();
      }

      if (!this.statusBarInUse) {
        if (Dashboard.stackName && Dashboard.stackName !== '') {
          this.statusBar.setLabel(Package.fromStackName(Dashboard.stackName).getConsoleUrl());
        } else {
          this.statusBar.setLabel('');
        }
      }

      this.render(tableCalcs);

    } catch (e) {
      CenvLog.single.catchLog(e as Error);
    }
  }

  updateVis() {
    if (this.blessedDeps) {
      this.blessedDeps.splitterOverride = null;
    }
    const newDefaultMax = this.maxColumnWidth;
    if (this.splitter.left > newDefaultMax) {
      this.splitter.left = newDefaultMax;
    }
    const tableCalcs = this.calcTableInfo();

    this.resizeWidgets(this.calcTableInfo());
  }

  render(tableCalcs: { tableWidth: number, columns: number }) {
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

      this.statusPanel?.updateVis();
      if (this.useBothPanels()) {
        const isWideCmdFirst = this.mode === DashboardMode.WIDE_CMD_FIRST;
        if (isWideCmdFirst) {
          this.cmdPanel?.setFront();
          this.statusPanel?.setFront();
        } else {
          this.statusPanel?.setFront();
          this.cmdPanel?.setFront();
        }
        this.cmdPanel?.render();
        this.statusPanel?.render();
      } else if (this.mode === DashboardMode.CMD) {
        this.cmdPanel?.render();
      } else {
        this.statusPanel?.render();
      }

      if (!Dashboard.toggleDebug) {
        this.debugLog.hide();
        this.debugLog.setBack();
        this.cmdPanel?.updateVis();
      } else {
        this.debugLog.show();
        this.debugLog.setFront();
        this.cmdPanel?.updateVis();
      }

      if (!this.statusOptions?.bar?.hidden && this.screen._borderStops) {
        this.statusOptions?.setFront()
        this.statusOptions?.render();
      }
      this.splitter.setFront();
      this.statusBar.setFront();
      this.splitter.render();

      this.statusBar.show();

      if (!this.menu?.bar?.hidden && this.screen._borderStops) {
        this.menu?.setFront();
        this.menu?.render();
      }
      this.redraw();
    }
  }

  resizeMode(tableCalcs: { tableWidth: number, columns: number }, bottomOffset = 0) {
    const screenHeight = this.screen.height - bottomOffset;
    const top = 2;
    const panelWidth = this.screen.width - tableCalcs.tableWidth - 2;

    if (this.statusPanel) {
      this.statusPanel.set(tableCalcs.tableWidth + 1, panelWidth + 1, this.statusOptions?.bar.top + (this.statusOptions?.active ? 3 : 0), screenHeight);
    }
    if (this.cmdPanel) {
      this.cmdPanel.set(tableCalcs.tableWidth + 1, panelWidth + 1, this.statusPanel?.bottom, screenHeight);
    }

    this.splitter.height = this.screen.height - 2 - bottomOffset;
  }

  resizeWidgets(tableCalcs: { tableWidth: number, columns: number }) {
    if (!tableCalcs) {
      tableCalcs = this.calcTableInfo();
    }
    this.maxProcessOptionsHeight = Package.getPackages(true).length + 14;
    this.packages.width = tableCalcs.tableWidth;
    this.packages.top = 0;
    this.packages.height = Package.getPackages().length + 5;

    let hideProcessOptions = false;

    if (this.screen.height < this.maxProcessOptionsHeight) {
      this.minimizeStatusPanel = true;
      hideProcessOptions = true;
      this.packages.height -= this.maxProcessOptionsHeight - this.screen.height;
      if (this.autoHidePanelHeight) {
        Dashboard.dependencyToggle = false;
        Dashboard.moduleToggle = false;
        Dashboard.paramsToggle = false;
      }
      this.statusOptions?.hide();
    } else {
      this.minimizeStatusPanel = false;
      this.statusOptions?.show();
    }

    if (this.processOptions) {
      if (!hideProcessOptions) {
        this.processOptions.bar.width = tableCalcs.tableWidth;
        this.processOptions.bar.top = this.packages.height;
        this.processOptions.show();
      } else {
        this.processOptions.hide();
      }
    }

    const screenHeight = this.screen.height - 1;
    this.status.left = 0;
    this.debugLog.left = this.packages.width + 1;
    this.debugLog.width = this.screen.width - this.packages.width;
    this.debugLog.top = this.statusPanel?.bottom.top;
    this.debugLog.height = screenHeight - this.debugLog.top;

    const fifthHeight = Math.floor(screenHeight / 5);
    const parameterHeight = Math.floor((screenHeight - fifthHeight - StatusPanel.modulesHeight + 1) / 2) - 1;
    const bottomOffset = this.menu?.active ? 3 : 0;
    this.resizeMode(tableCalcs, bottomOffset);

    this.status.top = this.packages.height + (hideProcessOptions ? 0 : 3);
    this.status.height = screenHeight - this.status.top - bottomOffset;
    this.status.width = this.packages.width;

    this.splitter.left = this.tableWidth;
    this.packageBox.left = this.packages.width;
    this.packageBox.top = 1;
    this.packageBox.setFront();
    this.packageBox.show();
    this.statusBar.width = this.screen.width;
    this.statusBar.position.top = this.screen.height - 1 - bottomOffset;

    if (this.statusOptions) {
      this.statusOptions.bar.width = this.screen.width - tableCalcs.tableWidth - 2;
      this.statusOptions.bar.top = 2;
      this.statusOptions.bar.left = tableCalcs.tableWidth + 1;
      this.statusOptions.bar.height = 3;
    }

    this.splitter.setFront();
    this.statusBar.setFront();
    this.screen.clearRegion(0, this.screen.width, 0, screenHeight);
  }

  calcTableInfo() {
    let tableWidth = this.maxColumnWidth;
    let autoScreenSize = Math.floor(this.screen.width / 2);
    if (autoScreenSize > tableWidth) {
      autoScreenSize = tableWidth;
    }
    if (this.splitter.left > tableWidth) {
      this.splitter.left = tableWidth;
    }

    if (this.blessedDeps) {
      if (!this.blessedDeps.splitterOverride) {
        this.blessedDeps.splitterOverride = this.maxColumnWidth;
      } else {
        tableWidth = this.blessedDeps.splitterOverride;
      }
    }

    let columns = this.columnWidth?.length;

    if (tableWidth > this.maxColumnWidth) {
      tableWidth = this.maxColumnWidth;
    } else {
      columns = 1;
      let stopGrowing = false;
      const nextWidth = this.priorityColumnWidth.reduce( (a: number, b: number) => {
        const nextValue = a + b + this.columnSpacing / 2;
        if (nextValue > this.splitter?.left || stopGrowing) {
          stopGrowing = true;
          return a;
        }
        columns++;
        return nextValue;
      });
      if (!this.blessedDeps?.splitterOverride) {
        tableWidth = nextWidth;
      }
    }

    if (!Dashboard.horizontalSplitterUserCtrl) {
      tableWidth = autoScreenSize
    }

    this.tableWidth = tableWidth;

    return {tableWidth, columns};
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
    this.cmdPanel?.hide();
    this.statusPanel?.hide();
  }

  show() {
    this.hidden = false;
    this.grid.show();
    this.packages.show();
    this.splitter.show();
    this.status.show();
    this.statusBar.show();
    this.cmdPanel?.show();
    this.statusPanel?.show();
  }

  private debug(...text: string[]) {
    if (!this.debugLog) {
      return;
    }
    const scroll = this.debugLog.getScrollPerc();
    this.debugLog.insertBottom(chalk.green(text.join(' ')));
    if (scroll > 90) {
      this.debugLog.setScrollPerc(100);
    }
  }
}
