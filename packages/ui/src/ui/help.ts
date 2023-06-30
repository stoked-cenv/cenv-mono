import { blessed, contrib } from './blessed';
import { Commands } from '../commands';
import {
  Package,
  CenvLog,
  PackageStatus, CenvParams, readFiles,
} from '@stoked-cenv/cenv-lib';
import StatusPanel from './statusPanel';
import chalk from 'chalk';
import { readFileSync, existsSync } from "fs";
import { join } from "path"

enum MenuType {
  TOPICS = 'topics',
  COMMANDS = 'commands'
}

export class HelpUI {
  screen;
  initialized = false;
  commands;
  grid;
  priorityColumnWidth = [];
  columnWidth;
  columnSpacing = 2;
  maxColumnWidth;
  focusIndex = -1;
  focusedBox;
  titleBox;
  tableWidth;
  static commandName = 'intro';
  static instance: HelpUI = undefined;
  statusBar;
  nextPanel;
  dependencies: string;
  dependenciesRemaining: string;
  cmdOptions: any;
  selectedCommand: string;
  selectedRowFg = undefined;
  selectedCommandFg = [255, 255, 255];
  selectedCommandFgHover = [20, 20, 20];
  selectedCommandBg = [30, 30, 30];
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
  green = [0, 255, 0];
  pkgStatus: PackageStatus;
  statusBarInUse = false;
  packageHover = null;
  packageTimer = null;
  blessedDeps;
  providers;
  currentProvider;
  cmdInfo;
  cmdMain;
  topics;
  topicList = {};
  currentMenuType = MenuType.TOPICS;
  startingTopic: 'intro'

  static shiftKeyDown = false;
  constructor(startingCmd?: string) {
    try {

      if (HelpUI.instance) {
        return;
      }

      // Cenv.dashboard = this;
      this.providers = Commands.module.providers
      this.createBaseWidgets();
      HelpUI.instance = this;

      this.titleBox = this.grid.set(0, 1, 1, 2, blessed.element, {
        mouse: true,
        keys: true,
        interactive: true,
        fg: 'white',
        label: 'docs',
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

      function tableRender() {
        if(this.screen.focused === this.rows) {
          this.rows.focus();
        }

        this.rows.width = this.width-3;
        this.rows.height = this.rows?.length+2;
        blessed.Box.prototype.render.call(this);
      }

      // border focus: [24, 242, 24]

      this.topics = this.grid.set(0, 0, 5, 2, contrib.table, this.getMenuOptions('topics'));
      this.topics.render = tableRender.bind(this.topics);

      this.commands = this.grid.set(0, 0, 5, 2, contrib.table, this.getMenuOptions('commands'));
      this.commands.render = tableRender.bind(this.commands);

      this.cmdInfo = this.grid.set(1, 1, 1, 2, blessed.list, {
        mouse: true,
        keys: true,
        style: {
          text: 'red',
          border: { fg: 'gray' },
          label: { side: 'right' },
        },
        scrollable: true,
        scrollbar: {
          ch: ' ',
          inverse: true,
        },
        autoScroll: false,
        template: { lines: true },
        columnWidth: [10, 10],
        padding: { left: 2, right: 2, top: 0, bottom: 0 },
      });

     this.setCmdInfo();

      this.cmdMain = this.grid.set(2, 1, 4, 3, contrib.markdown, {
          vi: true,
          fg: 'white',
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
          padding: { left: 2, right: 2, top: 0, bottom: 0 },
          autoScroll: false,
        });

      const data = [];
      Object.values(Commands.module.providers).map((cm: any) => {
        data.push([cm.meta.name])
      });

      this.commands.setData({ headers: [''], data})
      this.commands.name = 'packages';
      this.commands.rows.padding.bottom = 0;
      this.commands.rows.name = 'packageRows';
      this.commands.rows.items.name = 'packageItems';
      this.commands.rows.selected = -1;
      this.packageHover = false;
      this.packageTimer = null;

      this.titleBox.on('element mouseout', function mouseout(el, data) {
          this.packageHover = false;
        }.bind(this),
      );

      this.columnWidth = this.defaultColumnWidth;
      this.maxColumnWidth = this.defaultColumnWidth.reduce(function (a, b) {
        return a + b;
      });
      this.maxColumnWidth += (this.columnSpacing / 2) * this.columnWidth.length - 1;

      for (let i = 0; i < this.defaultColumnWidth.length; i++) {
        this.priorityColumnWidth.push(this.defaultColumnWidth[this.columnPriority.indexOf(i)]);
      }

      this.focusedBox = this.commands;

      this.commands.on('move', function move(offset) {
        console.log('offset', offset);
        //CenvLog.single.catchLog('offset: ' + offset);
      }.bind(this));

      this.commands.on('action', async function action() {
          //this.selectCommand();
        }.bind(this));

      this.topics.rows.on('select item', function () {
        this.selectCommand(MenuType.TOPICS);
      }.bind(this));

      this.commands.rows.on('select item', function () {
        this.selectCommand(MenuType.COMMANDS);
      }.bind(this));

      this.screen.key(['escape', 'q', 'C-c'], function () {
        this.screen.destroy();
        process.exit(0);
      }.bind(this));


      this.screen.key(['tab'], function (ch, key) {
        this.loadTopics();
        this.selectCommand(MenuType.TOPICS)
        }.bind(this),
      );

      this.screen.key(['S-tab'], function (ch, key) {
          //console.log('S-tab derp derp');
          //const newIndex = this.focusIndex - 1 < 0 ? this.focusPool().length - 1 : this.focusIndex - 1;
          //this.setFocusIndex(newIndex);
        }.bind(this),
      );


      this.screen.on('resize', function () {
          //this.resizeWidgets();
          //this.checkWideView();
        }.bind(this),
      );

      this.commands.focus();

      this.loadTopics();

      setInterval(
        async function mainLoop() {
          await this.update();
        }.bind(this), 50);

      this.selectCommand(MenuType.TOPICS)
    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  loadTopics() {
    const topicPath = join(__dirname, '../../../cli/docs/onlineHelp/help.json');
    const topicNames = require(topicPath).topics;
    const topicList = {};

    topicNames.forEach((name) => {
      const content = readFileSync(join(__dirname, `../../../cli/docs/onlineHelp/topics/${name.replace(/ /g, '_')}.md`), 'utf-8')
      this.topicList[name] = { name, content };
    })

    const data = Object.keys(this.topicList).map(k => [k]);
    this.initialized = true;
    this.topics.setData({headers: [''], data})
  }

  getMenuOptions(name) {
    return {
      mouse: true,
      keys: true,
      interactive: true,
      fg: [240, 240, 240],
      label: name,
      selectedFg: this.selectedCommandFg,
      selectedBg: this.selectedCommandBg,
      columnSpacing: this.columnSpacing,
      columnWidth: this.defaultColumnWidth,
      style: {
        border: { fg: 'grey' },
        selected: { bg: 'blue' },
        item: {
          hover: { bg: 'red' },
          focus: { bg: 'green' }
        },
        label: { fg: 'grey' }
      },
      padding: { bottom: 0, top: 0}
    };
  }

  postConstructor(topicList) {
    try {


    } catch(e) {
      CenvLog.single.catchLog('=' + e);
    }
  }

  setCmdInfo() {
    try {
      const items = [];
      if (this.currentProvider?.meta?.description) {
        items.push(this.currentProvider.meta.description);
      }
      if (this.currentProvider?.meta?.aliases) {
        items.push('');
        items.push(`aliases: ${this.currentProvider.meta.aliases.join(', ')}`);
      }
      this.cmdInfo.setItems(items)
    } catch(e) {
      CenvLog.single.catchLog(e);
    }
  }

  setCmdMain() {
    if (this.currentProvider) {
      if (!this.currentProvider.contentActual) {
        const path = join(__dirname, `../../../cli/docs/onlineHelp/commands/${this.currentProvider.meta.name}.md`);
        if (existsSync(path)) {
          this.currentProvider.content = readFileSync(join(__dirname, `../../../cli/docs/onlineHelp/commands/${this.currentProvider.meta.name}.md`), 'utf-8');
          this.currentProvider.contentActual = false;
        } else {
          this.currentProvider.content = readFileSync(join(__dirname, `../../../cli/docs/onlineHelp/commands/not_implemented.md`), 'utf-8');
        }
      }
      this.cmdMain.setMarkdown(this.currentProvider.content)
    } else {
      this.cmdMain.setMarkdown(this.topicList[HelpUI.commandName].content);
    }
  }

  get columnPriority() {
    return [0];
  }

  get defaultColumnWidth() {
    return [15];
  }

  createBaseWidgets() {
    try {
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
    } catch(e) {
      CenvLog.single.catchLog(e);
    }
  }

  getRowName(index = this.commands?.rows?.selected) {
    try {
      const items = this.commands?.rows?.items;
      const itemsLength = items?.length;
      if (index > -1 && itemsLength && index < itemsLength) {
        return items[index].content.split(' ')[0];
      }
    } catch(e) {
      CenvLog.single.catchLog(e);
    }
  }

  getTitle() {
    const help = ' - [add something here]'
    const title = `${this.getRowName()}${help ? ' ' + help : ''}`;
    return title;
  }

  focusPool() {
    return [this.commands];
  }

  setFocusIndex(index) {
 //
  }

  getPkg(commandName?: string) {
    return Package.cache[commandName ? commandName : HelpUI.commandName];
  }

  selectCommand(menuType: MenuType) {
    try {
      if (!this.initialized || this[menuType].rows.selected === -1) {
        return;
      }

      const selectedCommandItem = this[menuType].rows.items[this[menuType].rows.selected];

      const command = blessed.cleanTags(selectedCommandItem.content);
      if (command === '' || HelpUI.commandName === command) {
        return;
      }

      this.currentMenuType = menuType;
      HelpUI.commandName = command;

      if (menuType === MenuType.COMMANDS) {
        this.currentProvider = this.providers[command];
        this[MenuType.TOPICS].rows.selected = -1;
        this.cmdInfo.show();
      } else {
        this[MenuType.COMMANDS].rows.selected = -1;
        this.cmdInfo.hide();
        this.currentProvider = undefined;
      }
      this.titleBox.setLabel(command);
      this.setCmdInfo();
      this.setCmdMain();
      this.screen.render();

    } catch (e) {
      CenvLog.single.catchLog(e);
    }
  }

  async update() {
    try {
      if (!this.initialized)
        return;

      this.resizeWidgets();
      this.render();
    } catch (e) {
      CenvLog.single.catchLog(e as Error);
    }
  }

  render() {
    const title = this.getTitle();
    if (this.screen.title !== title) {
      this.screen.title = title;
    }

    this.screen.render();
    this.titleBox.render();
  }

  resizeWidgets() {
    const commandWidth = 20;

    this.topics.top = 2;
    this.topics.rows.top = 1;
    this.topics.rows.height = Object.keys(this.topicList).length + 1;
    this.topics.rows.padding.bottom = -1;
    this.topics.width = commandWidth;
    this.topics.height = Object.keys(this.topicList).length + 3;
    this.topics.padding.bottom = 0;

    this.commands.top = this.topics.top + this.topics.height;
    this.commands.rows.top = 1;
    this.commands.rows.height = Object.values(this.providers).length + 1;
    this.commands.rows.padding.bottom = -1;
    this.commands.width = commandWidth;
    this.commands.height = Object.values(this.providers).length + 3;
    this.commands.padding.bottom = 0;
    this.titleBox.left = commandWidth;
    this.titleBox.top = 1;
    this.cmdInfo.top = 2;
    this.cmdInfo.left = commandWidth;
    this.cmdInfo.width = this.screen.width - commandWidth;
    this.cmdInfo.height = 5;
    this.cmdMain.top = this.currentMenuType === MenuType.COMMANDS ? this.cmdInfo.top + this.cmdInfo.height : 2;
    this.cmdMain.left = commandWidth;
    this.cmdMain.height = this.screen.height - this.cmdMain.top;
    this.cmdMain.width = this.screen.width - commandWidth;
    const screenHeight = this.screen.height - 1;
    const fifthHeight = Math.floor(screenHeight / 5);
    const parameterHeight = Math.floor((screenHeight - fifthHeight - StatusPanel.modulesHeight + 1) / 2) - 1;
    this.titleBox.width = this.commands.width;
    this.statusBar.width = this.screen.width;
    this.statusBar.position.top = this.screen.height - 1;
    this.screen.clearRegion(0, this.screen.width, 0, screenHeight);
    this.statusBar.show();
  }

  destroy() {
    this.screen.destroy();
  }

  redraw() {
    //this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
  }
}

