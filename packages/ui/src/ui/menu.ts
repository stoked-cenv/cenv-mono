import blessed from 'blessed';


export default class MenuBar {
  box;
  bar;
  screen;
  active = false;

  constructor(screen: any, commands: any, position: any) {
    this.screen = screen;

    this.box = blessed.box({
      parent: this.screen,
      top: 0,
      right: 0,
      width: 'shrink',
      height: 'shrink',
      content: '...'
    });

    this.bar = blessed.listbar({
      ...position,
      parent: this.screen,
      height: 3,
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
      commands
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
  }

  setFront() {
    this.box.setFront();
    this.bar?.setFront();
  }

  render() {
    this.box?.render();
    this.bar?.render();
    this.screen?.render();
  }

  set(position: any) {
    this.bar.left = position.left;
    this.bar.right = position.right;
    this.bar.top = position.top;
    this.bar.bottom = position.bottom;
  }
}
