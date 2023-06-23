import blessed from 'blessed';
import {
  CenvLog,
  getMonoRoot,
  Package,
} from '@stoked-cenv/cenv-lib';
import contrib from 'blessed-contrib';
import { CenvPanel } from './panel';
import Groups from './group';
import chalk from 'chalk';
import { Dashboard } from './dashboard';

export default class StatusPanel extends CenvPanel {
  grid;
  modules;
  dependencies;
  selectedIndex;
  debugStr;
  dashboard;
  screen;
  initialized = false;
  moduleInfo;
  monoRoot;
  app;
  environment;
  global;
  globalEnv;
  parameterColumnWidth = 10;
  fullScreen = false;
  bottom;
  paramForm;
  paramTextbox;
  paramLabel;
  selectedParamKey;
  lastBottom;
  enableSelection = false;
  paramWidth = 12;
  paramTypesVisible = 0;
  paramSave;
  saveEnabled = false;

  constructor(dashboard) {
    super(dashboard);
    this.screen = dashboard.screen;
  }

  init() {
    try {

      this.bottom = 0
      const modulesOptions = {
        keys: true,
        mouse: true,
        selectedBg: [30, 30, 30],
        style: {
          text: 'red',
          selected: {
            bold: true,
            fg: [255, 255, 255],
            bg: [15, 40, 15],
          },
          item: {
            fg: [140, 140, 140],
          },
          border: {fg: 'gray'},
          label: {side: 'right', top: '20%-10', fg: 'gray'},
          header: {height: 0}
        },
        template: {lines: true}
      };

      this.modules = this.addGridWidget(
        blessed.list,
        modulesOptions,
        [0, 2, 1, 1],
        true,
      );

      this.modules.name = 'modules';

      this.dependencies = this.addGridWidget(
        blessed.box,
        {
          top: 'center',
          left: 'center',
          width: '50%',
          height: '50%',
          content: '',
          tags: true,
          label: 'dependencies',
          border: {
            type: 'line'
          },
          style: {
            border: {fg: 'gray'},
            label: {fg: 'gray'}
          }
        },
        [1, 2, 2, 3],
        true,
      );
      this.dependencies.name = 'dependencies';

      this.addParamCtrl('app', [2, 2, 3, 3]);
      this.addParamCtrl('environment', [2, 2, 3, 3]);
      this.addParamCtrl('global', [2, 3, 3, 3]);
      this.addParamCtrl('globalEnv', [2, 3, 3, 3]);

      Groups['details'] = [
        this.app,
        this.environment,
        this.global,
        this.globalEnv,
        this.dependencies,
      ];
      Groups['fullScreen'] = Groups['details'];

      this.dependencies.on('element click', function () {
          const index = Dashboard.instance.focusPool().indexOf(this.dependencies);
          this.setFocus(index);
        }.bind(this),
      );

      this.dependencies.on(' click', function () {
          const index = Dashboard.instance.focusPool().indexOf(this.dependencies);
          this.setFocus(index);
        }.bind(this),
      );

      this.dependencies.on('wheeldown', function () {
          const index = Dashboard.instance.focusPool().indexOf(this.dependencies);
          this.setFocus(index);
          this.dependencies.scroll((this.dependencies.height / 2) | 0 || 1);
          this.dependencies.screen.render();
        }.bind(this),
      );

      this.dependencies.on('wheelup', function () {
          const index = Dashboard.instance.focusPool().indexOf(this.dependencies);
          this.setFocus(index);
          this.dependencies.scroll(-((this.dependencies.height / 2) | 0) || -1);
          this.dependencies.screen.render();
        }.bind(this),
      );

      setTimeout(
        function () {
          //infoLog(this.dependencies.insertBottom(util.inspect(this.modules)));
        }.bind(this),
        10000,
      );

      this.moduleInfo = this.grid.set(0, 3, 1, 2, blessed.list, {
        mouse: true,
        keys: true,
        style: {
          text: 'red',
          border: {fg: 'gray'},
          label: {side: 'right', fg: 'gray'},
        },
        scrollable: true,
        scrollbar: {
          ch: ' ',
          inverse: true,
        },
        autoScroll: false,
        template: {lines: true},
        label: 'module info',
        columnWidth: [10, 10],
      });
      this.monoRoot = getMonoRoot();

      this.modules.on(
        'select item',
        function (item, index) {
          if (this.selectedIndex === index) {
            return;
          }

          const cmd = this.getPkgCmd(index);
          if (!cmd) {
            return;
          }

          this.selectedIndex = index;
          this.selectModule(item, index);
        }.bind(this),
      );

      this.modules.on(
        'element click',
        function () {
          const index = Dashboard.instance.focusPool().indexOf(this.modules);
          this.setFocus(index);
        }.bind(this),
      );

      this.moduleInfo.on(
        'element click',
        function () {
          const index = Dashboard.instance.focusPool().indexOf(this.modules);
          this.setFocus(index);
        }.bind(this),
      );

      this.paramForm = blessed.form({
        parent: this.screen,
        mouse: true,
        keys: true,
        vi: true,
        left: 0,
        top: 0,
        width: '100%',
        style: {
          bg: 'black',
          scrollbar: {
            inverse: true
          }
        },
        scrollable: true,
        scrollbar: {
          ch: ' '
        },
        hidden: true
      });

      this.paramForm.on('submit', function (data) {
        //output.setContent(JSON.stringify(data, null, 2));
        //screen.render();
      }.bind(this));

      this.paramTextbox = blessed.textbox({
        parent: this.paramForm,
        mouse: true,
        keys: true,
        style: {
          border: {
            fg: [200, 200, 200]
          },
        },
        border: {
          type: 'line',
        },
        padding: {
          right: 2,
          left: 2
        },
        height: 3,
        width: 20,
        left: 1,
        top: 1,
        name: 'text',
        hidden: false
      });
      this.paramTextbox.type = 'paramsUI';

      this.paramTextbox.on('focus', function () {
        // this.paramTextbox.readInput();
      }.bind(this));

      this.paramLabel = blessed.text({
        parent: this.paramForm,
        content: 'Key:',
      });

      if (this.saveEnabled) {
        this.paramSave = blessed.button({
          parent: this.paramForm,
          mouse: true,
          keys: true,
          shrink: true,
          top: 0,
          name: 'SAVE',
          content: 'SAVE',
          bold: true,
          padding: {
            right: 2,
            left: 2
          },
          style: {
            bold: true,
            fg: 'white',
            bg: 'black',
            focus: {
              inverse: true
            },
            border: {
              fg: 'white'
            }
          },
          border: {
            type: 'line',
          },
          hidden: true
        });
        this.paramSave.hide();

        this.paramSave.type = 'paramsUI';
        this.paramSave.on('press', function() {
          this.paramForm.submit();
        }.bind(this));
      }

    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  get nextTop() {
    return this.lastBottom;
  }

  get showParams() {
    const pkg = this.getPkg();
    return pkg?.params?.hasCenvVars && pkg.params?.localVars && Object.keys(pkg.params?.localVars).length;
  }

  paramTypeVisible(type: string): boolean {
    const pkg = this.getPkg();
    return this.showParams && pkg.params.localVarsTyped[type] && Object.keys(pkg.params.localVarsTyped[type]).length > 0;
  }

  getParameterWidgetOptions(label, bg = 'black') {

    const columnWidth = [
      this.parameterColumnWidth,
      this.parameterColumnWidth,
    ];

    return {
      mouse: true,
      keys: true,
      fg: 'white',
      selectedFg: 'black',
      selectedBg: [24, 242, 24],
      columnSpacing: 2,
      label,
      columnWidth,
      style: {
        bg: bg,
        border: {fg: 'gray'},
        label: {fg: 'gray',}
      },
    };
  }

  selectParam(name, item) {
    this.enableSelection = true;
    this.selectedParamKey = blessed.cleanTags(item.content);

    if (!this.selectedParamKey || !this.selectedParamKey.length) {
      return;
    }
    const indexText = Dashboard.instance.focusPool().indexOf(this.paramTextbox);
    if (indexText === -1) {
      //this.focusPoolWidgets.push(this.paramTextbox);
      //this.focusPoolWidgets.push(this.paramSave);
    }

    const pkg = this.getPkg();
    this.paramTextbox.setValue(pkg.params?.localVarsTyped[name][this.selectedParamKey]);
    this.paramLabel.content = ' ' + this.selectedParamKey;

    this.paramLabel.show();
    this.paramTextbox.show();
    this.paramForm.show();
    this.paramForm.render();
    const index = Dashboard.instance.focusPool().indexOf(this[name]);
    this.updateParamUI();
    this.setFocus(index);
  }

  addParamCtrl(name, gridOptions) {
    this[name] = this.addGridWidget(contrib.table, this.getParameterWidgetOptions(name), gridOptions, true);
    this[name].name = name;
    this[name].type = 'params';
    this[name].rows.top = 0;


    //this[name].on('blur', function() {
    //  console.log('term term')
    //});

    this[name].on('focus', function() {
      console.log('term term')
    });

    this[name].rows.on('move', function (var1, var2) {
      this.selectParam(name, var1);
    }.bind(this));

    this[name].on('element click', function (item, itemIndex) {
      this.selectParam(name, item);
      const index = Dashboard.instance.focusPool().indexOf(this[name]);
      this.setFocus(index);
    }.bind(this));

    this[name].rows.on('focus', function (item, itemIndex) {
      //console.log('wtf', item, itemIndex);
    }.bind(this));




    this[name].render = function() {
      if(this.screen.focused == this.rows) {
        this.rows.focus();
      }

      this.rows.width = this.width-3;
      this.rows.height = this.height-2;
      blessed.Box.prototype.render.call(this);
    };
  }

  selectModule(selectedItem, selectedIndex) {
    if (!selectedItem || !selectedItem.content) {
      return;
    }

    const pkg = this.getPkg();
    pkg.activeModuleIndex = selectedIndex;

    const selectedType = blessed.cleanTags(selectedItem.content);
    const module = pkg.modules.find((m) => m.type === selectedType);
    if (module) {
      this.moduleInfo?.setItems(module.moduleInfo);
    }
  }

  setFocus(focusIndex) {
    this.dashboard.setFocusIndex(focusIndex);
  }

  getLargestParamCount(pkg) {
    const counts = pkg?.params?.localCounts;
    let mostKeys = counts?.app > counts?.environment ? counts?.app : counts?.environment;
    mostKeys = counts?.global > mostKeys ? counts?.global : mostKeys;
    mostKeys = counts?.globalEnv > mostKeys ? counts?.globalEnv : mostKeys;
    return mostKeys;
  }

  updateParams(pkg: Package) {
    let mostKeys = this.getLargestParamCount(pkg);
    mostKeys = mostKeys > 10 ? 10 : mostKeys;
    this.updateParameters('app', pkg, mostKeys);
    this.updateParameters('environment', pkg, mostKeys);
    this.updateParameters('global', pkg, mostKeys);
    this.updateParameters('globalEnv', pkg, mostKeys);
  }

  updateParameters(type: string, pkg: Package, height = -1) {
    const enabled = this.paramTypeVisible(type);
    if (enabled) {
      const vars = pkg.params?.localVarsTyped[type];
      const hasStatus = pkg.hasCheckedStatus();
      const data = [];
      if (vars) {
        for (const [k, v] of Object.entries(vars) as [string, string][]) {
          let color;
          let name = k.substring(0, this.parameterColumnWidth - 1);
          if (hasStatus) {
            if (pkg.params.needsDeploy) {
              color = chalk.red;
            } else if (pkg.params.needsMaterialization) {
              color = chalk.hex('#FFA500');
            }
            if (color) {
              name = color(name);
            }
          }
          data.push([name]);
        }
      }
      this[type].setData({headers: [], data});
      this[type].rows.selected = -1;
      this[type].show();
    } else {
      const headers = [];
      //this[type].setData({ headers, data: [] });
      //this[type].hide();
    }
    if (height > 0) {
      this[type].height = height;
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

    this.modules.setItems(pkg.modules.map((m) => m.type.toString()));
    this.paramForm.hide()
    this.paramTextbox.hide();
    this.paramLabel.hide();

    this.updateParams(pkg);
    if (pkg.activeModuleIndex) {
      this.selectModule(this.modules.items[pkg.activeModuleIndex], pkg.activeModuleIndex);
    } else {
      this.selectModule(this.modules.items[0], 0);
    }

    this.updateVis();
    this.dashboard.screen.render();
  }

  static modulesHeight = 6;
  parameterWidth = -1;
  previousWidth = -1;
  panelWidth = -1;

  set(left, width, top, height) {
    try {
      this.panelWidth = width;
      const fifthWidth = Math.floor(width / 5);
      const pkg = this.getPkg();
      if (!pkg) {
        return;
      }

      if (pkg.modules.length) {
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
        this.modules.left = this.screen.width + 1;
        this.moduleInfo.left = this.screen.width + 1;
      }

      if (pkg.meta?.service?.length) {
        this.dependencies.width = width;
        this.dependencies.left = left;
        this.dependencies.top = top;
        this.dependencies.height = 4;
        top = this.dependencies.top + this.dependencies.height;
      } else {
        this.dependencies.left = this.screen.width + 1;
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

        if (paramWidthValid) {
          this.app.left = left;
          this.app.top = top2;
          this.app.height = parameterHeight;
          this.app.width = this.parameterWidth + (widthRemainder === 3 ? 1 : 0);
          leftWidth = this.app.left + this.app.width;
          this.app.setFront();
        }

        if (this.paramTypeVisible('environment')) {
          widthMultiplier++
        }

        if (paramWidthValid) {
          this.environment.left = leftWidth;
          this.environment.top = top2;
          this.environment.height = parameterHeight;
          this.environment.width = this.parameterWidth + (widthRemainder === 2 ? 1 : 0);
          leftWidth = this.environment.left + this.environment.width;
        }

        if (this.paramTypeVisible('global')) {
          widthMultiplier++
        }

        if (paramWidthValid) {
          this.global.left = leftWidth;
          this.global.top = top2;
          this.global.height = parameterHeight;
          this.global.width = this.parameterWidth + (widthRemainder === 1 ? 1 : 0);
          leftWidth = this.global.left + this.global.width;
        }

        if (this.paramTypeVisible('globalEnv')) {
          widthMultiplier++;
        }

        if (paramWidthValid) {
          this.globalEnv.top = top2;
          this.globalEnv.width = this.parameterWidth;
          this.globalEnv.height = parameterHeight;
          this.globalEnv.left = leftWidth;
        }

        const visibleParamTypeCount = widthMultiplier + 1;
        this.previousWidth = this.parameterWidth;
        this.parameterWidth = Math.floor(width / visibleParamTypeCount);
        this.parameterColumnWidth = this.parameterWidth - 1;
        this.app.options.columnWidth = [this.parameterWidth]
        this.global.options.columnWidth = [this.parameterWidth]
        this.environment.options.columnWidth = [this.parameterWidth]
        this.globalEnv.options.columnWidth = [this.parameterWidth]

        top += parameterHeight  + (this.paramForm.hidden ? 0 : 3);


      } else {
        this.app.left = this.screen.width + 1;
        this.environment.left = this.screen.width + 1;
        this.global.left = this.screen.width + 1;
        this.globalEnv.left = this.screen.width + 1;
      }

      if (Groups.fullScreenActive) {
        Groups.fullScreenFocus.width = width;
        Groups.fullScreenFocus.left = left;
        Groups.fullScreenFocus.top = this.modules.top + this.modules.height;
        Groups.fullScreenFocus.height = height - (StatusPanel.modulesHeight + 1);
      }


      this.bottom = top;
    }

    catch(e) {
      CenvLog.single.catchLog(e);
    }
  }

  debug(message) {
    this.dashboard.debugStr = message;
  }

  updateParamUI() {
    if (this.selectedParamKey) {
      const widthRemainder = this.panelWidth - (this.parameterWidth * 4);
      this.app.width = this.parameterWidth + (widthRemainder === 3 ? 1 : 0);
      this.environment.width = this.parameterWidth + (widthRemainder === 2 ? 1 : 0);
      this.global.width = this.parameterWidth + (widthRemainder === 1 ? 1 : 0);
      this.globalEnv.width = this.parameterWidth;
      this.paramForm.left = Dashboard.instance.packages.width + 2;
      this.paramForm.top = this.app.top + this.app.height;
      this.paramForm.height = 3;
      this.paramForm.width = this.dependencies.width;
      this.paramForm.hidden = false;
      this.paramTextbox.left = this.selectedParamKey.length + 2;
      this.paramTextbox.top = 0;
      this.paramTextbox.style.border.fg = 'gray'
      this.paramTextbox.height = 3
      this.paramTextbox.width = this.panelWidth - this.paramTextbox.left// - 11;
      this.paramTextbox.setFront();

      this.paramLabel.top = 1;
      if (this.saveEnabled) {
        this.paramSave.left = this.panelWidth - 11;
        this.paramSave.top = 0;
        this.paramSave.hidden = false;
      }
    }
  }

  render() {

    this.updateParamUI();
    this.modules.render();
    this.moduleInfo.render();
    Groups.render();
    if (this.showParams) {
      this.app.show();
      this.environment.show();
      this.global.show();
      this.globalEnv.show();
    }
    this.app.render();
    this.environment.render();
    this.global.render();
    this.globalEnv.render();
    this.paramForm.render();
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
    Groups.detailWidgets?.map((w) => w.hide());
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
        this.app.hide();
        this.global.hide();
        this.globalEnv.hide();
        this.environment.hide();
        Groups.detailWidgets?.map((w) => w.hide());
        Groups.fullScreenFocus?.hide();
        return;
      }
      super.show();

      this.lastBottom = 0;
      if (pkg.modules?.length) {
        this.modules.show();
        this.moduleInfo.show();
        this.lastBottom = this.modules.bottom;
      } else {
        this.modules.hide();
        this.moduleInfo.hide();
      }

      if (pkg.meta?.service?.length) {
        this.dependencies.show();
        this.lastBottom = this.dependencies.bottom;
      } else {
        this.dependencies.hide();
      }
      this.showType('app');
      this.showType('global');
      this.showType('globalEnv');
      this.showType('environment');


      if (Groups.fullScreenActive) {
        Groups.detailWidgets?.map((w) => w.show());
        Groups.fullScreenFocus?.hide();
      } else {
        Groups.detailWidgets?.map((w) => w.hide());
        Groups.fullScreenFocus?.show();
      }
      this.active = true;
    } catch(e) {
      CenvLog.single.catchLog(e);
    }
  }

  showType(type: string) {
    if (this.paramTypeVisible(type)) {
      this[type].show();
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
      Groups.detailWidgets?.map((w) => w.show());
      Groups.fullScreenFocus?.hide();
    } else {
      Groups.detailWidgets?.map((w) => w.hide());
      Groups.fullScreenFocus?.show();
    }
  }

  setBack() {
    this.dependencies.setBack();
    this.modules.setBack();
    this.moduleInfo.setBack();
    this.app.setBack();
    this.global.setBack();
    this.globalEnv.setBack();
    this.environment.setBack();
    //Groups.fullScreenFocus?.setBack();
    this.paramForm.setBack();
    this.paramTextbox.setBack();
    this.paramLabel.setBack();
  }

  setFront() {
    this.dependencies.setFront();
    this.modules.setFront();
    this.moduleInfo.setFront();
    this.app.setFront();
    this.global.setFront();
    this.globalEnv.setFront();
    this.environment.setFront();
    //Groups.setFront();
    this.paramForm.setFront();
    this.paramTextbox.setFront();
    this.paramLabel.setFront();
  }
}
