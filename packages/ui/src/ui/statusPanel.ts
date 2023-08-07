/// <reference types="../../types/blessed"/>
import blessed from 'blessed';
import { Cenv, CenvFiles, CenvLog, Package, PackageModule, ProcessMode } from '@stoked-cenv/lib';
import * as contrib from 'blessed-contrib';
import { CenvPanel } from './panel';
import Groups from './group';
import { Dashboard, ParamsMode } from './dashboard';

contrib.table.prototype.baseRender = contrib.table.prototype.render;

enum ParamType {
  app, environment, global, globalEnv
}

export default class StatusPanel extends CenvPanel {
  static modulesHeight = 6;
  grid: any;
  modules: any;
  dependencies: any;
  selectedIndex: any;
  debugStr: any;
  dashboard: Dashboard;
  initialized = false;
  moduleInfo: any;
  monoRoot: any;

  // param controls
  app: blessed.List;
  environment: blessed.List;
  global: blessed.List;
  globalEnv: blessed.List;
  paramCtrlMap: Record<string, blessed.List> = {};

  parameterColumnWidth = 10;
  fullScreen = false;
  bottom: any;
  paramForm: any;
  paramTextbox: any;
  paramLabel: any;
  selectedParamKey: any;
  lastBottom: any;
  enableSelection = false;
  paramWidth = 12;
  paramTypesVisible = 0;
  paramSave: any;
  saveEnabled = false;
  parameterWidth = -1;
  previousWidth = -1;
  panelWidth = -1;

  constructor(dashboard: any) {
    super(dashboard);
    this.dashboard = dashboard;
  }

  get nextTop() {
    return this.lastBottom;
  }

  get showParams() {
    const pkg = this.getPkg();
    return pkg?.params?.hasCenvVars && pkg.params?.localCounts && Dashboard.paramsToggle !== ParamsMode.OFF;
  }

  init() {
    try {

      this.bottom = 0;

      const modulesOptions = {
        keys: true, mouse: true, selectedBg: [30, 30, 30], style: {
          text: 'red', selected: {
            bold: true, fg: [255, 255, 255], bg: [15, 40, 15],
          }, item: {
            fg: [140, 140, 140],
          }, border: { fg: 'gray' }, label: { side: 'right', top: '20%-10', fg: 'gray' }, header: { height: 0 },
        }, template: { lines: true },
      };

      this.modules = this.addGridWidget(blessed.list, modulesOptions, [0, 2, 1, 1], true);

      this.modules.name = 'modules';

      this.dependencies = this.addGridWidget(blessed.box, {
        top: 'center', left: 'center', width: '50%', height: '50%', content: '', tags: true, label: 'dependencies', border: {
          type: 'line',
        }, style: {
          border: { fg: 'gray' }, label: { fg: 'gray' },
        },
      }, [1, 2, 2, 3], true);
      this.dependencies.name = 'dependencies';

      this.app = this.addParamCtrl('app', [2, 2, 3, 3]);
      this.environment = this.addParamCtrl('environment', [2, 2, 3, 3]);
      this.global = this.addParamCtrl('global', [2, 3, 3, 3]);
      this.globalEnv = this.addParamCtrl('globalEnv', [2, 3, 3, 3]);
      this.paramCtrlMap = {
        app: this.app, environment: this.environment, global: this.global, globalEnv: this.globalEnv,
      };

      /*
      Groups['details'] = [
        this.app,
        this.environment,
        this.global,
        this.globalEnv,
        this.dependencies,
      ];
      Groups['fullScreen'] = Groups['details'];

       */

      this.dependencies.on('element click', () => {
        if (Dashboard.instance) {
          const index = Dashboard.instance.focusPool.indexOf(this.dependencies);
          this.setFocus(index);
        }
      });

      this.dependencies.on(' click', () => {
        if (Dashboard.instance) {
          const index = Dashboard.instance.focusPool.indexOf(this.dependencies);
          this.setFocus(index);
        }
      });

      this.dependencies.on('wheeldown', () => {
        if (Dashboard.instance) {
          const index = Dashboard.instance?.focusPool.indexOf(this.dependencies);
          this.setFocus(index);
          this.dependencies.scroll((this.dependencies.height / 2) | 0 || 1);
          this.dependencies.screen.render();
        }
      });

      this.dependencies.on('wheelup', () => {
        if (Dashboard.instance) {
          const index = Dashboard.instance?.focusPool.indexOf(this.dependencies);
          this.setFocus(index);
          this.dependencies.scroll(-((this.dependencies.height / 2) | 0) || -1);
          this.dependencies.screen.render();
        }
      });

      this.moduleInfo = this.dashboard.grid.set(0, 3, 1, 2, blessed.list, {
        mouse: true, keys: true, style: {
          text: 'red', border: { fg: 'gray' }, label: { side: 'right', fg: 'gray' },
        }, scrollable: true, scrollbar: {
          ch: ' ', inverse: true,
        }, autoScroll: false, template: { lines: true }, label: 'module info', columnWidth: [10, 10],
      });
      this.monoRoot = CenvFiles.getMonoRoot();

      this.modules.on('select item', (item: any, index: number) => {
        if (this.selectedIndex === index) {
          return;
        }

        const cmd = this.getPkgCmd(index);
        if (!cmd) {
          return;
        }

        this.selectedIndex = index;
        this.selectModule(item, index);
      });

      this.modules.on('element click', () => {
        if (Dashboard.instance) {
          const index = Dashboard.instance.focusPool.indexOf(this.modules);
          this.setFocus(index);
        }
      });

      this.moduleInfo.on('element click', () => {
        if (Dashboard.instance) {
          const index = Dashboard.instance.focusPool.indexOf(this.modules);
          this.setFocus(index);
        }
      });

      this.paramForm = blessed.form({
        parent: this.dashboard.screen, mouse: true, keys: true, vi: true, left: 0, top: 0, width: '100%', style: {
          bg: 'black', scrollbar: {
            inverse: true,
          },
        }, scrollable: true, scrollbar: {
          ch: ' ',
        }, hidden: true,
      });

      this.paramForm.on('submit', function(data: any) {
        //output.setContent(JSON.stringify(data, null, 2));
        //screen.render();
      });

      this.paramTextbox = blessed.textbox({
        parent: this.paramForm,
        mouse: true,
        keys: true,
        style: {
          border: {
            fg: [200, 200, 200],
          },
        },
        border: {
          type: 'line',
        },
        padding: {
          right: 2, left: 2,
        },
        height: 3,
        width: 20,
        left: 1,
        top: 1,
        name: 'text',
        hidden: true,
      });
      this.paramTextbox.type = 'paramsUI';
      this.paramTextbox.hide();

      this.paramTextbox.on('focus', () => {
        // this.paramTextbox.readInput();
      });

      this.paramLabel = blessed.text({
        parent: this.paramForm, content: 'Key:', hidden: true,
      });

      if (this.saveEnabled) {
        this.paramSave = blessed.button({
          parent: this.paramForm, mouse: true, keys: true, shrink: true, top: 0, name: 'SAVE', content: 'SAVE', bold: true, padding: {
            right: 2, left: 2,
          }, style: {
            bold: true, fg: 'white', bg: 'black', focus: {
              inverse: true,
            }, border: {
              fg: 'white',
            },
          }, border: {
            type: 'line',
          }, hidden: true,
        });
        this.paramSave.hide();

        this.paramSave.type = 'paramsUI';
        this.paramSave.on('press', () => {
          this.paramForm.submit();
        });
      }

    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  paramTypeVisible(type: string): boolean {
    const pkg = this.getPkg();
    let typeHasValues;
    const params = pkg.params;
    switch(Dashboard.paramsToggle) {
      case ParamsMode.MATERIALIZED:
        typeHasValues = params?.materializedVars && Object.keys(params.materializedVars).length > 0;
        break;
      case ParamsMode.DEPLOYED:
        typeHasValues = params?.pushedVarsTyped && params.pushedVarsTyped[type as keyof object] && Object.keys(params.pushedVarsTyped[type as keyof object]).length > 0
        break;
      case ParamsMode.LOCAL:
        typeHasValues = params?.localVarsTyped[type as keyof object] && Object.keys(params.localVarsTyped[type as keyof object]).length > 0;
        break;
      case ParamsMode.OFF:
      default:
        typeHasValues = false;
        break;
    }
    return !!this.showParams && !!typeHasValues;
  }

  getParams(pkg: Package, type: string): any{
    const params = pkg.params;
    let vars: any = undefined;
    if (params) {
      switch (Dashboard.paramsToggle) {
        case ParamsMode.MATERIALIZED:
          if (params.materializedVarsTyped) {
            vars = params.materializedVarsTyped[type as keyof object];
          }
          break;
        case ParamsMode.DEPLOYED:
          if (params.pushedVarsTyped) {
            vars = params.pushedVarsTyped[type as keyof object];
          }
          break;
        case ParamsMode.LOCAL:
          if (params.localVarsTyped) {
            vars = params.localVarsTyped[type as keyof object];
          }
          break;
      }
    }
    return vars;
  }
  getParameterWidgetOptions(type: string, bg = 'black') {

    const columnWidth = [this.parameterColumnWidth, this.parameterColumnWidth];

    return {
      mouse: true, keys: true, fg: 'white', selectedFg: 'black', selectedBg: [24, 242, 24], columnSpacing: 2, type, columnWidth, style: {
        bg: bg, border: { fg: 'gray' }, label: { fg: 'gray' },
      }, label: type,
    };
  }

  getParamValue(key: string, pkg: any, type?: string) {
    let value = '';
    switch(Dashboard.paramsToggle) {
      case ParamsMode.MATERIALIZED:
        value = pkg.params?.materializedVars[key];
        break;
      case ParamsMode.DEPLOYED:
        if (type) {
          value = pkg.params?.pushedVarsTyped[type as keyof object][key];
        }
        break;
      case ParamsMode.LOCAL:
        if (type) {
          value = pkg.params?.localVarsTyped[type as keyof object][key];
        }
        break;
      case ParamsMode.OFF:
      default:
        value = '';
        break;
    }
    return value;
  }

  selectParam(name: string, item: any) {
    this.enableSelection = true;
    this.selectedParamKey = blessed.cleanTags(item.content);

    if (!this.selectedParamKey || !this.selectedParamKey.length) {
      return;
    }
    const indexText = Dashboard.instance?.focusPool.indexOf(this.paramTextbox);
    if (indexText === -1) {
      //this.focusPoolWidgets.push(this.paramTextbox);
      //this.focusPoolWidgets.push(this.paramSave);
    }

    const pkg = this.getPkg();
    this.paramTextbox.setValue(this.getParamValue(this.selectedParamKey, pkg));
    this.paramLabel.content = ' ' + this.selectedParamKey;

    Dashboard.debug('selectParam', name);
    if (this.showParams) {
      this.paramLabel.show();
      this.paramTextbox.show();
      this.paramForm.show();
    }
    if (Dashboard.instance) {
      const index = Dashboard.instance?.focusPool.indexOf(this[name as keyof object]);
      this.updateParamUI();
      this.setFocus(index);
    }
  }

  addParamCtrl(type: string, gridOptions: number[]) {
    const paramCtrl = this.addGridWidget(contrib.table, this.getParameterWidgetOptions(type), gridOptions, true);
    paramCtrl.type = 'params';
    paramCtrl.name = type;
    paramCtrl.rows.top = 0;
    paramCtrl.active = paramCtrl.hidden;

    paramCtrl.hide = () => {
      if (paramCtrl.hidden) {
        return;
      }
      paramCtrl.clearPos();
      paramCtrl.hidden = true;
      paramCtrl.emit('hide');
      if (paramCtrl.screen.focused === this) {
        paramCtrl.screen.rewindFocus();
      }
    };

    paramCtrl.show = () => {
      if (!paramCtrl.hidden) {
        return;
      }
      paramCtrl.hidden = false;
      paramCtrl.emit('show');
    };

    paramCtrl.on('blur', () => {
      const pkg = this.getPkg();
      pkg.info('term term');
    });

    paramCtrl.on('element click', (item: any) => {
      this.selectParam(paramCtrl.name, item);
      if (Dashboard.instance) {
        const index = Dashboard.instance.focusPool.indexOf(this.paramCtrlMap[paramCtrl.name]);
        this.setFocus(index);
      }
    });

    paramCtrl.rows.on('select item', async (item: any) => {
      this.selectParam(paramCtrl.name, item);
      if (Dashboard.instance) {
        const index = Dashboard.instance.focusPool.indexOf(this.paramCtrlMap[paramCtrl.name]);
        this.setFocus(index);
      }
    });

    paramCtrl.render = () => {
      if (this.dashboard.screen.focused == paramCtrl.rows) {
        paramCtrl.rows.focus();
      }

      paramCtrl.rows.width = paramCtrl.width - 3;
      paramCtrl.rows.height = paramCtrl.height - 2;
      paramCtrl.baseRender();
    };
    return paramCtrl;
  }

  selectModule(selectedItem: any, selectedIndex: number) {
    if (!selectedItem || !selectedItem.content) {
      return;
    }

    const pkg = this.getPkg();
    pkg.activeModuleIndex = selectedIndex;

    const selectedType = blessed.cleanTags(selectedItem.content);
    const module = pkg.modules.find((m: PackageModule) => m.type === selectedType);
    if (module) {
      this.moduleInfo?.setItems(module.moduleInfo);
    }
  }

  setFocus(focusIndex: number) {
    this.dashboard.setFocusIndex(focusIndex);
  }

  getLargestParamCount(pkg: Package) {
    const counts = pkg?.params?.localCounts;
    if (!counts) {
      return 0;
    }
    let mostKeys = counts?.app > counts?.environment ? counts?.app : counts?.environment;
    mostKeys = counts?.global > mostKeys ? counts?.global : mostKeys;
    mostKeys = counts?.globalEnv > mostKeys ? counts?.globalEnv : mostKeys;
    return mostKeys;
  }

  async updateParams(pkg: Package) {
    let mostKeys = this.getLargestParamCount(pkg);
    mostKeys = mostKeys > 10 ? 10 : mostKeys;
    const fi = this.dashboard.focusIndex;
    await this.updateParameters(this.app, pkg, mostKeys);
    await this.updateParameters(this.environment, pkg, mostKeys);
    await this.updateParameters(this.global, pkg, mostKeys);
    await this.updateParameters(this.globalEnv, pkg, mostKeys);
    this.dashboard.setFocusIndex(fi);
  }

  async updateParameters(paramCtrl: any, pkg: Package, height = -1) {
    const vars = this.getParams(pkg, paramCtrl.name);
    if (!vars) {
      return;
    }
    const hasStatus = await pkg.hasCheckedStatus();
    const data: Array<string[]> = [];
    if (vars) {
      for (const [k] of Object.entries(vars) as [string, string][]) {
        let color;
        let name = k.substring(0, this.parameterColumnWidth - 1);
        if (hasStatus) {
          if (pkg.params?.needsDeploy) {
            color = CenvLog.colors.error;
          } else if (pkg.params?.needsMaterialization) {
            color = CenvLog.colors.error;
          }
          if (color) {
            name = color(name);
          }
        }
        data.push([name]);
      }
    }
    paramCtrl.setData({ headers: [], data });
    paramCtrl.rows.selected = -1;
    paramCtrl.show();

    if (height > 0) {
      paramCtrl.height = height;
    } else if (height === 0) {
      //this[type].hide();
    }
  }

  async updatePackage() {
    const pkg = this.getPkg();

    if (!pkg) {
      this.hide();
      return;
    }

    this.modules.setItems(pkg.modules.map((m: PackageModule) => m.type.toString()));

    await this.updateParams(pkg);
    if (pkg.activeModuleIndex) {
      this.selectModule(this.modules.items[pkg.activeModuleIndex], pkg.activeModuleIndex);
    } else {
      this.selectModule(this.modules.items[0], 0);
    }
    this.updateVis();
    this.dashboard.screen.render();
  }

  dependenciesVisable() {
    const pkg = this.getPkg();
    if (!pkg) {
      return false;
    }

    if (Dashboard.dependencyToggle) {
      if (this.dashboard.cmd === ProcessMode.DEPLOY && !pkg.meta?.data.deployDependencies?.length) {
        return false;
      } else if (this.dashboard.cmd === ProcessMode.DEPLOY && !pkg.meta?.data.destroyDependencies?.length) {
        return false;
      } else if (!pkg.meta?.data.destroyDependencies?.length && !pkg.meta?.data.deployDependencies?.length) {
        return false;
      }
      return true;
    }
    return false;
  }

  set(left: number, width: number, top: number, height: number) {
    try {
      this.panelWidth = width;
      const fifthWidth = Math.floor(width / 5);
      const pkg = this.getPkg();
      if (!pkg) {
        return;
      }

      if (pkg.modules.length && Dashboard.moduleToggle) {
        this.modules.width = fifthWidth;
        this.modules.left = left; // Math.ceil((this.screen.width / 5) * 2) -1;
        this.modules.top = top;
        this.moduleInfo.top = top;
        this.modules.height = StatusPanel.modulesHeight;
        this.moduleInfo.height = StatusPanel.modulesHeight;
        this.moduleInfo.left = left + fifthWidth;
        this.moduleInfo.width = width - fifthWidth;
        top = this.moduleInfo.top + this.modules.height;
      } else {
        this.modules.left = this.dashboard.screen.width + 1;
        this.moduleInfo.left = this.dashboard.screen.width + 1;
      }

      if (this.dependenciesVisable()) {
        this.dependencies.width = width;
        this.dependencies.left = left;
        this.dependencies.top = top;
        this.dependencies.height = 4;
        top = this.dependencies.top + this.dependencies.height;
      } else {
        this.dependencies.hide();
      }

      if (this.showParams) {
        let parameterHeight = this.getLargestParamCount(pkg) + 4;
        if (parameterHeight > 10) {
          parameterHeight = 10;
        }
        const paramWidthValid = this.parameterWidth !== -1;

        const top2 = top;
        let widthMultiplier = 0;
        const widthRemainder = this.panelWidth - (this.parameterWidth * 4);
        let leftWidth = -1;

        if (paramWidthValid && this.app) {
          this.app.left = left;
          this.app.top = top2;
          this.app.height = parameterHeight;
          this.app.width = this.parameterWidth + (widthRemainder === 3 ? 1 : 0);
          leftWidth = this.app.left + this.app.width;
          this.app.setFront();
        }

        widthMultiplier++;

        if (paramWidthValid && this.environment) {
          this.environment.left = leftWidth;
          this.environment.top = top2;
          this.environment.height = parameterHeight;
          this.environment.width = this.parameterWidth + (widthRemainder === 2 ? 1 : 0);
          leftWidth = this.environment.left + this.environment.width;
        }

        widthMultiplier++;

        if (paramWidthValid && this.global) {
          this.global.left = leftWidth;
          this.global.top = top2;
          this.global.height = parameterHeight;
          this.global.width = this.parameterWidth + (widthRemainder === 1 ? 1 : 0);
          leftWidth = this.global.left + this.global.width;
        }

        widthMultiplier++;

        if (paramWidthValid && this.globalEnv) {
          this.globalEnv.top = top2;
          this.globalEnv.width = this.parameterWidth;
          this.globalEnv.height = parameterHeight;
          this.globalEnv.left = leftWidth;
        }

        const visibleParamTypeCount = widthMultiplier + 1;
        this.previousWidth = this.parameterWidth;
        this.parameterWidth = Math.floor(width / visibleParamTypeCount);
        this.parameterColumnWidth = this.parameterWidth - 1;
        if (this.app) {
          this.app.options.columnWidth = [this.parameterWidth];
        }
        if (this.global) {
          this.global.options.columnWidth = [this.parameterWidth];
        }
        if (this.environment) {
          this.environment.options.columnWidth = [this.parameterWidth];
        }
        if (this.globalEnv) {
          this.globalEnv.options.columnWidth = [this.parameterWidth];
        }

        top += parameterHeight + (this.selectedParamKey && !this.paramTextbox.hidden ? 3 : 0);

      } else {
        if (this.app && this.environment && this.global && this.globalEnv) {
          this.app.left = this.dashboard.screen.width + 1;
          this.environment.left = this.dashboard.screen.width + 1;
          this.global.left = this.dashboard.screen.width + 1;
          this.globalEnv.left = this.dashboard.screen.width + 1;
        }
      }

      if (Groups.fullScreenActive) {
        Groups.fullScreenFocus.width = width;
        Groups.fullScreenFocus.left = left;
        Groups.fullScreenFocus.top = this.modules.top + this.modules.height;
        Groups.fullScreenFocus.height = height - (StatusPanel.modulesHeight + 1);
      }

      if (Cenv.dashboard.statusOptions.active) {
        this.dashboard.statusOptions?.setFront();
      }
      this.bottom = top;
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  debug(message: string) {
    this.dashboard.debugStr = message;
  }

  updateParamUI() {
    //if (this.selectedParamKey) {
    const widthRemainder = this.panelWidth - (this.parameterWidth * 4);
    this.app.width = this.parameterWidth + (widthRemainder === 3 ? 1 : 0);
    this.environment.width = this.parameterWidth + (widthRemainder === 2 ? 1 : 0);
    this.global.width = this.parameterWidth + (widthRemainder === 1 ? 1 : 0);
    this.globalEnv.width = this.parameterWidth;
    this.paramForm.left = Dashboard.instance?.packages.width + 2;
    this.paramForm.top = this.app.top + this.app.height;
    this.paramForm.height = 3;
    this.paramForm.width = this.dependencies.width - 1;
    this.paramTextbox.left = this.selectedParamKey?.length + 2;
    this.paramTextbox.top = 0;
    this.paramTextbox.style.border.fg = 'gray';
    this.paramTextbox.height = 3;
    this.paramTextbox.width = this.panelWidth - this.paramTextbox.left - 11;

    this.paramLabel.top = 1;
    if (this.saveEnabled) {
      this.paramSave.left = this.panelWidth - 11;
      this.paramSave.top = 0;
      this.paramSave.hidden = false;
    }
    //}
  }

  render() {

    this.updateParamUI();
    this.modules.render();
    this.moduleInfo.render();
    Groups.render();

    this.app?.render();
    this.environment?.render();
    this.global?.render();
    this.globalEnv?.render();
    this.paramForm.render();
    this.paramTextbox.render();
    this.paramLabel.render();
  }

  hide() {
    super.hide();
    Dashboard.debug('statusPanel hide()');

    this.modules.hide();
    this.dependencies.hide();
    this.moduleInfo.hide();
    this.app.hide();
    this.global.hide();
    this.globalEnv.hide();
    this.environment.hide();
    this.paramForm.hide();
    this.paramTextbox.hide();
    this.paramLabel.hide();
    Groups.detailWidgets?.map((w: any) => w.hide());
    Groups.fullScreenFocus?.hide();
    this.active = false;
  }

  updateVis() {
    try {

      const pkg = this.getPkg();
      if (!pkg || pkg.isGlobal) {
        this.modules.hide();
        this.moduleInfo.hide();
        this.dependencies.hide();
        this.app?.hide();
        this.global?.hide();
        this.globalEnv?.hide();
        this.environment?.hide();
        this.paramForm.hide();
        this.paramTextbox.hide();
        this.paramLabel.hide();
        Groups.detailWidgets?.map((w: any) => w.hide());
        Groups.fullScreenFocus?.hide();
        return;
      }
      super.show();

      this.lastBottom = 0;
      if (pkg.modules?.length && Dashboard.moduleToggle) {
        this.modules.show();
        this.moduleInfo.show();
        this.lastBottom = this.modules.bottom;
      } else {
        this.modules.hide();
        this.moduleInfo.hide();
      }

      if (this.dependenciesVisable()) {
        this.dependencies.show();
        this.lastBottom = this.dependencies.bottom;
      } else {
        this.dependencies.hide();
      }
      this.showType('app');
      this.showType('global');
      this.showType('globalEnv');
      this.showType('environment');

      if (!!this.showParams && !this.selectedParamKey && Dashboard.paramsToggle !== ParamsMode.OFF) {
        Dashboard.debug(`!this.selectedParamKey: ${!this.selectedParamKey}, !Dashboard.paramsToggle: ${!Dashboard.paramsToggle}`);
        this.paramForm.hide();
        this.paramForm.left = this.screen.width -10
        this.paramTextbox.hide();
        this.paramLabel.hide();
      }

      if (Groups.fullScreenActive) {
        Groups.detailWidgets?.map((w: any) => w.show());
        Groups.fullScreenFocus?.hide();
      } else {
        Groups.detailWidgets?.map((w: any) => w.hide());
        Groups.fullScreenFocus?.show();
      }
      this.active = true;
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  showType(paramCtrlName: string) {
    if (this.paramTypeVisible(paramCtrlName)) {
      const paramCtrl = this.paramCtrlMap[paramCtrlName];
      paramCtrl?.show();
    }
  }

  show() {
    super.show();
    this.modules.show();
    this.moduleInfo.show();
    this.dependencies.show();
    this.app.show();
    this.global.show();
    this.globalEnv.show();
    this.environment.show();

    if (Groups.fullScreenActive) {
      Groups.detailWidgets?.map((w: any) => w.show());
      Groups.fullScreenFocus?.hide();
    } else {
      Groups.detailWidgets?.map((w: any) => w.hide());
      Groups.fullScreenFocus?.show();
    }
  }

  setBack() {
    this.dependencies.setBack();
    this.modules.setBack();
    this.moduleInfo.setBack();
    this.app?.setBack();
    this.global?.setBack();
    this.globalEnv?.setBack();
    this.environment?.setBack();
    //Groups.fullScreenFocus?.setBack();
    this.paramForm.setBack();
    this.paramTextbox.setBack();
    this.paramLabel.setBack();
  }

  setFront() {
    this.dependencies.setFront();
    this.modules.setFront();
    this.moduleInfo.setFront();
    this.app?.setFront();
    this.global?.setFront();
    this.globalEnv?.setFront();
    this.environment?.setFront();
    //Groups.setFront();
    this.paramForm.setFront();
    this.paramTextbox.setFront();
    this.paramLabel.setFront();
  }
}
