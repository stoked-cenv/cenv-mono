import blessed from 'blessed';
import {Dashboard} from './dashboard';
import {Deployment, DeploymentMode} from '../deployment';
import {CenvLog, getPkgContext, Package, PkgContextType, ProcessStatus} from '@stoked-cenv/cenv-lib';
import chalk from 'chalk';
import {HelpUI} from "./help";
import {validateBaseOptions} from "../utils";


export default class MenuBar {
  box;
  bar;
  screen;
  active = false;
  dashboard = null;

  constructor(dashboard: Dashboard) {
    const auto = true;
    this.screen = dashboard.screen;
    this.dashboard = dashboard;

    this.box = blessed.box({
      parent: this.screen,
      top: 0,
      right: 0,
      width: 'shrink',
      height: 'shrink',
      content: '...',
    });

    let deploying = false;
    async function launchDeployment(mode: DeploymentMode) {
      try {
        deploying = true;
        Dashboard.instance.cmd = mode;

        const packages = getContext();
        if (!packages) {
          return;
        }
        packages.map((p: Package) => p.processStatus = ProcessStatus.INITIALIZING)

        let deploymentOptions = {};
        if (mode === DeploymentMode.DESTROY) {
          validateBaseOptions({packages}, deploymentOptions,  DeploymentMode.DESTROY)
          await Deployment.Destroy(packages, { ...Deployment.options, ...deploymentOptions });
        } else {
          validateBaseOptions({packages}, deploymentOptions,  DeploymentMode.DEPLOY)
          await Deployment.Deploy(packages, { ...Deployment.options, ...deploymentOptions });
        }

        Dashboard.instance.cmd = undefined;

        deploying = false;
      } catch (e) {
        CenvLog.single.catchLog(e);
      }
    }

    function getContext(type: PkgContextType = PkgContextType.COMPLETE, failOnInvalid = true) {
      const selectedPkg = Dashboard.instance.getPkg();
      const ctx = getPkgContext(selectedPkg, type, failOnInvalid);
      if (!ctx) {
        dashboard.setStatusBar('invalid state', 'at least one package is in an invalid state');
        return;
      }

      if (selectedPkg?.stackName === 'GLOBAL') {
        Deployment.options.dependencies = true;
      } else {
        Deployment.options.dependencies = false ;
      }
      return ctx.packages;
    }

    function statusText(titleText, descriptionText) {
      return `${chalk.blueBright.bold(titleText)}: ${descriptionText}`;
    }

    const debounceFlags = {};
    let clearLabelTimeout = null;
    function debounceCallback(name, callback, onTimeout = undefined) {
      if (debounceFlags[name]) {
        return;
      }
      Dashboard.instance.statusBarInUse = true;
      callback();

      debounceFlags[name] = true;

      setTimeout(() => {
        Dashboard.instance.statusBarInUse = false;
        delete debounceFlags[name];
      }, 250);

      if (clearLabelTimeout) {
        clearTimeout(clearLabelTimeout);
      }
      clearLabelTimeout = setTimeout(() => {
        if (onTimeout) {
          onTimeout();
        }
        Dashboard.instance.statusBar.setLabel('');
      }, 2000);
    }
/*
    function getPkgProcessingContext(selectedPkg: Package): { packages: Package[] } | false {
      let packages = [];
      const invalidStatePackages = [];
      if (selectedPkg?.stackName === 'GLOBAL') {
        packages = Object.values(Package.cache).filter((p: Package) => !p.isGlobal);
      } else {
        packages = [selectedPkg];
      }
      packages = packages.filter((p: Package) => {
        switch(p.processStatus) {
          case ProcessStatus.READY:
          case ProcessStatus.HAS_PREREQS:
          case ProcessStatus.PROCESSING:
            return true;
          default:
            return false;
        }
      });

      if (invalidStatePackages.length) {
        return false;
      }
      return { packages };
    }

 */

    this.bar = blessed.listbar({
      parent: this.screen,
      bottom: 1,
      left: 3,
      right: 3,
      height: auto ? 'shrink' : 3,
      mouse: true,
      keys: true,
      autoCommandKeys: true,
      border: 'line',
      vi: true,
      style: {
        position: { width: 19 },
        border: {
          fg: ' ',
        },
        bg: '#51A9B3',
        item: {
          bg: '#185056',
          hover: {
            bg: '#0e363b',
          },
          //focus: {
          //  bg: '#185056'
          //}
        },
        prefix: {
          fg: 'black',
        },
        selected: {
          bg: '#0e363b',
        },
      },
      commands: {
        /*

                bump: {
                  keys: ['b'],
                  callback: function () {
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
                            return statusText(
                              `${bumpType} builds`,
                              `increment ${packages} by ${bumpMode} if changes detected`,
                            );
                          case BumpType.DECREMENT:
                            return statusText(
                              `${bumpType} builds`,
                              `decrement ${packages} by ${bumpMode} if changes detected`,
                            );
                          case BumpType.FINALIZE_PRERELEASE:
                            return statusText(
                              `${bumpType}`,
                              `remove ${bumpMode} build identifiers from ${packages2} if they exist`,
                            );
                        }
                      }

                      dashboard.setStatusBar('bumpAction', getBumpText());
                    });
                  }.bind(this),
                },
                'next bump mode': {
                  keys: ['C-b'],
                  callback: function () {
                    debounceCallback('nextBumpMode', async () => {
                      const nextMode = Version.nextBumpMode;
                      dashboard.setStatusBar(
                        'nextBumpMode',
                        statusText(`cycle bump mode`, `${nextMode} enabled`),
                      );
                    });
                  }.bind(this),
                },
                'next bump type': {
                  keys: ['S-b'],
                  callback: function () {
                    debounceCallback('nextBumpType', async () => {
                      const nextType = Version.nextBumpType;
                      dashboard.setStatusBar(
                        'nextBumpMode',
                        statusText(`cycle bump type`, `${nextType}`),
                      );
                    });
                  }.bind(this),
                },
                'next color': {
                  keys: ['n'],
                  callback: function() {
                    debounceCallback('nextColor', async () => {
                      CenvLog.nextColor();
                      dashboard.setStatusBar(
                        'nextColor',
                        statusText(
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
                        statusText(
                          `increment ${CenvLog.getRgb()}`,
                          `${CenvLog[CenvLog.getRgb()]}`,
                        ),
                      );
                    })
                  }
                },
                'clear versions': {
                  keys: ['o'],
                  callback: function () {
                    debounceCallback('clearVersions', async () => {
                      const ctx = getPkgCompleteContext();
                      const packages =
                        ctx.packages.length > 1
                          ? `${ctx.packages.length} packages`
                          : `${ctx.packages[0].packageName.toUpperCase()}`;
                      dashboard.setStatusBar(
                        'resetBump',
                        statusText(
                          `reset bump versions`,
                          `remove all bump versions from ${packages}`,
                        ),
                      );
                      await Version.Bump(ctx.packages, 'reset');
                    });
                  }.bind(this),
                },
                */
        deploy: {
          keys: ['d'],
          callback: async function () {
            debounceCallback('deploy', async () => {
              const pkgs = getContext();
              if (!pkgs) {
                return;
              }
              const packages = pkgs.length > 1 ? `${pkgs.length} packages` : `${pkgs[0].packageName.toUpperCase()}`;
              dashboard.setStatusBar('launchDeployment', statusText(`deploy`, `${packages}`));
              await launchDeployment(DeploymentMode.DEPLOY);
            });
          }.bind(this),
        },
        destroy: {
          keys: ['y'],
          callback: async function () {
            debounceCallback('destroy', async () => {
              const pkgs = getContext();
              if (!pkgs) {
                return;
              }
              const packages =
                  pkgs.length > 1
                  ? `${pkgs.length} packages`
                  : `${pkgs[0].packageName.toUpperCase()}`;
              dashboard.setStatusBar(
                'launchDestroy',
                statusText(`destroy`, packages),
              );
              await launchDeployment(DeploymentMode.DESTROY);
            });
          }.bind(this),
        },
        'retry':{
          keys: ['r'],
          callback: async function() {
            if (!Deployment?.mode()) {
              return;
            }

            if (Dashboard.stackName === 'GLOBAL') {
              return;
            }
            const pkgFile = Package.cache[Dashboard.stackName];
            pkgFile.processStatus = ProcessStatus.INITIALIZING;
            pkgFile.createCmd('user initiated retry [r]', 0, 'great success!');
            //Deployment.toProcess[pkgFile.stackName] = pkgFile;
            await Deployment.start();
          }.bind(this),
        },
        'debug': {
          keys: ['x'],
          callback: async function () {
            debounceCallback('toggle debug', async () => {
              Dashboard.toggleDebug = !Dashboard.toggleDebug;
              dashboard.setStatusBar('toggleDebug',
                statusText(
                  Dashboard.toggleDebug ? `toggle debug view` : `toggle status view`,
                  Dashboard.toggleDebug ? `debug view enabled` : `status view enabled`));
            });
          }.bind(this),
        },
        'clear debug': {
          keys: ['c'],
          callback: function () {
            debounceCallback('clearVersions', async () => {
              Dashboard.instance.statusBarInUse = true;
              if (
                this.dashboard.focusedBox === this.dashboard.cmdPanel.stdout
              ) {
                this.dashboard.cmdPanel.stdout.setContent('');
                dashboard.setStatusBar('clearStdout', statusText('clear', 'stdout panel'));
              } else if (this.dashboard.focusedBox === this.dashboard.cmdPanel.stderr) {
                this.dashboard.cmdPanel.stderr.setContent('');
                dashboard.setStatusBar('clearStderr', statusText('clear', 'stderr panel'));
              } else {
                Dashboard.instance.debugLog.setContent('');
                dashboard.setStatusBar('clearDebug', statusText('clear', 'debug log'));
              }
            });
          }.bind(this),
        },
        'cancel deploy': {
          keys: ['S-d'],
          callback: function () {
            const ctx = getContext(PkgContextType.PROCESSING, false);
            if (!ctx) {
              return;
            }
            debounceCallback('cancelDeploy', async () => {
              ctx.map(p => {
                CenvLog.single.stdLog(Deployment.logStatusOutput('current deployment test', Dashboard.instance.cmdPanel.stdout), p.stackName);
                if (Deployment.dependencies[p.stackName]) {
                  delete Deployment.dependencies[p.stackName];
                }
                if (Deployment.dependencies) {
                  Object.keys(Deployment.dependencies).map(stackName => {
                    Deployment.dependencies[stackName].dependencies = Deployment.dependencies[stackName].dependencies.filter(d => d.stackName !== p.stackName);
                  })
                }

                if (Deployment.toProcess && Deployment.toProcess[p.stackName]) {
                  delete Deployment.toProcess[p.stackName];
                }
                p.processStatus = ProcessStatus.CANCELLED;
              })

              dashboard.setStatusBar('cancel deploy', `cancel ${ctx.length === 1 ? ctx[0].packageName : ctx.length + ' packages'}`);
            });
          }.bind(this),
        },
        'strict versions': {
          keys: ['S-v'],
          callback: function () {
            debounceCallback('strictVersions', async () => {
              if (Deployment?.options) {
                Deployment.options.strictVersions =
                  !Deployment.options?.strictVersions;
                dashboard.setStatusBar(
                  'toggleView',
                  statusText(
                    'strict versions mode',
                    Deployment.options.strictVersions ? 'enabled' : 'disabled',
                  ),
                );
              }
            });
          }.bind(this),
        },
        'check status': {
          keys: ['enter'],
          callback: async function () {
            const ctx = getContext();
            if (!ctx?.length) {
                return;
            }
            const packages = ctx.length > 1 ? `${ctx.length} packages` : `${ctx[0]?.packageName?.toUpperCase()}`;
            dashboard.setStatusBar(
              'checkStatus',
              statusText(
                'status check',
                `check deployment status of ${packages}`,
              ),
            );
            ctx.filter((p: Package) => !p.isGlobal).map(async (p: Package) => await p.checkStatus(Deployment?.mode()?.toString(), ProcessStatus.COMPLETED));
          }.bind(this),
        },
        /*save: {
          keys: ['s'],
          callback: function () {
            debounceCallback('create dump', async () => {
              dashboard.setStatusBar(
                'createDump',
                statusText(
                  'log dump',
                  `generate a log dump for all packages currently loaded`,
                ),
              );
              // Dialogs.saveDump(this.screen);
              this.screen.render();
            });
          }.bind(this),
        },*/
        'help': {
          keys: ['f1'],
          callback: function () {
            this.dashboard.hide();
            new HelpUI();
          }.bind(this),
        },
        'dependencies': {
          keys: ['8'],
          callback: async function () {
            debounceCallback('toggle dependencies', async () => {
              Deployment.toggleDependencies = !Deployment.toggleDependencies;
              const name = 'toggle dependencies';
              dashboard.setStatusBar(name, statusText(name,Deployment.toggleDependencies ? `dependencies enabled` : `dependencies disabled`));
            });
          }.bind(this),
        },
        'fix dupes': {
          keys: ['9'],
          callback: async function () {
            try {
              const name = 'fix param dupes';
              debounceCallback(name, async () => {
                const ctx = getContext();
                if (!ctx) {
                  return;
                }
                await Promise.all(ctx?.map(async (p: Package) => await p?.params?.fixDupes()));
                dashboard.setStatusBar(name, statusText(name, 'remove dupes for global and globalEnv param types'));
              });
            } catch (e) {
              CenvLog.single.catchLog(e);
            }
          }.bind(this),
        },
        'pre-build': {
          keys: ['0'],
          callback: async function () {
            debounceCallback('toggle auto pre-build', async () => {
              Deployment.options.skipBuild = !Deployment?.options.skipBuild;
              const name = 'toggle auto pre-build';
              dashboard.setStatusBar(name, statusText(name, Deployment.options.skipBuild ? `auto pre-build disabled` : `auto pre-build enabled`));
            });
          }.bind(this),
        },
      },
    });

    this.box.hide();
    this.bar.hide();
    this.screen.append(this.bar);
  }

  hide() {
    this.active = false;
    this.box.hide();
    this.bar.hide();
  }

  show() {
    this.active = true;
    this.setFront();
    this.box.show();
    this.bar.show();
    this.screen.render();
  }

  setFront() {
    this.box.setFront();
    this.bar.setFront();
  }

  render() {
    this.box.render();
    this.bar.render();
    this.screen.render();
  }
}
