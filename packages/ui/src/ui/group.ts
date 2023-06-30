import { Dashboard } from './dashboard';

export default class Groups extends Object {
  static fullScreenFocus = undefined;
  static detailWidgets = undefined;
  static fullScreenWidgets = undefined;
  static fullScreenActive = false;

  static openFullScreen(focusWidget) {
    const group = this['fullScreen']

    if (!group) {
      return;
    }

    if (!group.filter(w => w.name === focusWidget.name)?.length) {
      return;
    }

    this.fullScreenFocus = focusWidget;
    this.fullScreenWidgets = [focusWidget];
    this.detailWidgets = group.filter(w => w !== this.fullScreenFocus );
    const fullScreenOnly = this['fullScreenOnly'];
    if (fullScreenOnly) {
      this.fullScreenWidgets.push(focusWidget);
    }
    this.fullScreenWidgets?.forEach(r => r.show());
    this.detailWidgets?.forEach(r => r.hide());
    this.fullScreenActive = true;
  }

  static closeFullScreen() {
    this['fullScreenOnly']?.forEach(r => r.hide());
    this.detailWidgets.push(this.fullScreenFocus);
    this.detailWidgets?.forEach(r => r.show());
    this.fullScreenActive = false;
  }
  static setFront() {
    if (this.fullScreenActive) {
      this.fullScreenWidgets?.forEach(r => r.setFront());
      this.detailWidgets?.forEach(r => r.setBack());
    } else {
      this.fullScreenWidgets?.forEach(r => r.setBack());
      this.detailWidgets?.forEach(r => r.setFront());
    }
  }
  static render() {
    if (this.fullScreenActive) {
      this.detailWidgets?.forEach(r => r.hide());
      Groups['fullScreenOnly']?.forEach(r => r.render());
      this.fullScreenWidgets?.forEach(r => r.render());
    } else {
      this.fullScreenWidgets?.forEach(r => r.hide());
      Groups['fullScreenOnly']?.forEach(r => r.hide());
      this.detailWidgets?.forEach(r => r.show());
      this.detailWidgets?.forEach(r => r.render());
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
