import { Dashboard } from './dashboard';

export default class Groups extends Object {
  static fullScreenFocus: any = undefined;
  static detailWidgets: any = undefined;
  static fullScreenWidgets: any = undefined;
  static fullScreenActive = false;

  static openFullScreen(focusWidget: any) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const group = this['fullScreen']

    if (!group) {
      return;
    }

    if (!group.filter((w: any) => w.name === focusWidget.name)?.length) {
      return;
    }

    this.fullScreenFocus = focusWidget;
    this.fullScreenWidgets = [focusWidget];
    this.detailWidgets = group.filter((w: any) => w !== this.fullScreenFocus );
    const fullScreenOnly = this['fullScreenOnly' as keyof NonNullable<unknown>];
    if (fullScreenOnly) {
      this.fullScreenWidgets.push(focusWidget);
    }
    this.fullScreenWidgets?.forEach((r: any) => r.show());
    this.detailWidgets?.forEach((r: any) => r.hide());
    this.fullScreenActive = true;
  }

  static closeFullScreen() {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    this['fullScreenOnly']?.forEach((r: any) => r.hide());
    this.detailWidgets.push(this.fullScreenFocus);
    this.detailWidgets?.forEach((r: any) => r.show());
    this.fullScreenActive = false;
  }
  static setFront() {
    if (this.fullScreenActive) {
      this.fullScreenWidgets?.forEach((r: any) => r.setFront());
      this.detailWidgets?.forEach((r: any) => r.setBack());
    } else {
      this.fullScreenWidgets?.forEach((r: any) => r.setBack());
      this.detailWidgets?.forEach((r: any) => r.setFront());
    }
  }
  static render() {
    if (this.fullScreenActive) {
      this.detailWidgets?.forEach((r: any) => r.hide());
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      Groups['fullScreenOnly' as keyof object]?.forEach((r: any) => r.render());
      this.fullScreenWidgets?.forEach((r: any) => r.render());
    } else {
      this.fullScreenWidgets?.forEach((r: any) => r.hide());
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      Groups['fullScreenOnly' as keyof unknown]?.forEach((r: any) => r.hide());
      this.detailWidgets?.forEach((r: any) => r.show());
      this.detailWidgets?.forEach((r: any) => r.render());
    }
  }
  static toggleFullscreen() {

    if (!this.fullScreenActive) {
      this.openFullScreen(Dashboard.getFocusWidget());
    } else {
      this.closeFullScreen();
    }

  }
}
