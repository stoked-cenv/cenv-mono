import blessed from 'blessed';
import contrib from 'blessed-contrib'
import { PackageCmd, Package, PackageModule } from '@stoked-cenv/lib';
import { Dashboard } from './dashboard'

export abstract class CenvPanel {
  grid: contrib.Widgets.GridElement;
  active = false;
  dashboard: Dashboard;
  screen: blessed.Screen;
  widgets: any [];
  focusPoolWidgets: any [];

  constructor(dashboard: Dashboard) {
    this.dashboard = dashboard;
    this.grid = dashboard.grid;
    this.screen = dashboard.screen;
    this.widgets = [];
    this.focusPoolWidgets = [];
  }

  addWidget(widget: any) {
    this.widgets.push(widget);
  }

  fatRender() {
    this.setFront();
    this.show();
    this.render();
  }

  focusText: string;
  get focusPool(): any[] {
    return this.focusPoolWidgets.filter(w => !w.hidden);
  }

  addGridWidget(widget: any, widgetOptions: Record<string, any>, gridOptions: number[], focusable = false, grid?: undefined) {
    const theGrid = grid || this.grid;
    const newWidget = theGrid.set(
      gridOptions[0],
      gridOptions[1],
      gridOptions[2],
      gridOptions[3],
      widget,
      widgetOptions);

    this.widgets.push(newWidget)
    if (focusable){
      this.focusPoolWidgets.push(newWidget);
    }

    return newWidget
  }

  getPkgCmd(cmdIndex: number) {
    const cmds = this.getPkgCmds();
    if (cmds)  {
      return cmds[cmdIndex];
    }
  }

  getPkgCmds() : PackageCmd [] {
    return this.getPkg()?.cmds;
  }

  getPkgModule(cmdIndex: number) {
    return this.getPkgModules()[cmdIndex];
  }

  getPkgModules() : PackageModule [] {
    return this.getPkg()?.modules;
  }

  getPkg() : Package {
    return Package?.cache[Dashboard.stackName]
  }

  setFocus(focusIndex: number){
    this.dashboard.setFocusIndex(focusIndex);
  }

  debug(message: string) {
    this.dashboard.debugStr = message;
  }

  abstract set(left: number, width: number, top: number, height: number): void;
  abstract render(): void;

  hide() {
    this.active = false;
  }

  show() {
    this.active = true;
    //Dashboard.log('hide from cmdPanel');
  }
  abstract setBack(): void;
  abstract setFront(): void;
  abstract init(): void;
}
