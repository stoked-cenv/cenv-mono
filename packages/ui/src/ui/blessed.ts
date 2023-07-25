import * as blessed from 'blessed';
import * as contrib from 'blessed-contrib';
import {Dashboard} from './dashboard';

const blessedDeps: { dashboard?: Dashboard, splitterOverride: any } = {dashboard: undefined, splitterOverride: null};
let colorTimeout: NodeJS.Timeout | undefined;
const widgetSpacing = 0;

function getBlessedDeps() {
  return blessedDeps;
}

blessed.text.prototype.name = '';

blessed.widget.List.prototype.move = async function (offset: number) {
  this.select(this.selected + offset);
};

function MergeRecursive(obj1: any, obj2: any) {
  if (obj1 == null) {
    return obj2;
  }
  if (obj2 == null) {
    return obj1;
  }

  for (const p in obj2) {
    try {
      // property in destination object set; update its value
      if (obj2[p].constructor == Object) {
        obj1[p] = MergeRecursive(obj1[p], obj2[p]);
      } else {
        obj1[p] = obj2[p];
      }
    } catch (e) {
      // property in destination object not set; create it and set its value
      obj1[p] = obj2[p];
    }
  }

  return obj1;
}

contrib.grid.prototype.set = function (row: number, col: number, rowSpan: number, colSpan: number, obj: any, opts: Record<string, any>) {
  if (obj instanceof contrib.grid) {
    throw ('Error: A Grid is not allowed to be nested inside another grid.\r\n' + 'Note: Release 2.0.0 has breaking changes. Please refer to the README or to https://github.com/yaronn/blessed-contrib/issues/39');
  }

  // @ts-ignore
  const top = row * this.options.cellHeight + this.options.dashboardMargin;
  // @ts-ignore
  const left = col * this.options.cellWidth + this.options.dashboardMargin;

  //var options = JSON.parse(JSON.stringify(opts));
  let options: any = {};
  options = MergeRecursive(options, opts);
  options.top = top + '%';
  options.left = left + '%';
  // @ts-ignore
  options.width = this.cellWidth * colSpan - widgetSpacing + '%';
  // @ts-ignore
  options.height = this.cellHeight * rowSpan - widgetSpacing + '%';
  if (!options.hideBorder) {
    // @ts-ignore
    options.border = {type: 'line', fg: this.options?.color || 'cyan'};
  }

  const instance = obj(options);
  this.options.screen.append(instance);
  return instance;
};

blessed.widget.Box.prototype.enableDrag = function (verify: (data: any) => boolean) {
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  const self = this;

  if (this._draggable) {
    return true;
  }

  if (typeof verify !== 'function') {
    verify = function (data: any) {
      if (process.env.CENV_UI_DEBUG) {
        Dashboard.debug(JSON.stringify(data, null, 2));
      }
      return true;
    };
  }

  this.enableMouse();

  this.on('mousedown', (this._dragMD = function (data: any) {
    if (self.screen._dragging) {
      return;
    }
    if (!verify(data)) {
      return;
    }
    self.screen._dragging = self;

    self._drag = {
      x: data.x - self.aleft, y: data.y - self.atop,
    };
    self.setFront();
  }),);

  this.onScreenEvent('mouse', (this._dragM = function (data: any) {
    if (self.screen._dragging !== self) {
      return;
    }
    if (data.action !== 'mousedown' && data.action !== 'mousemove') {
      delete self.screen._dragging;
      delete self._drag;

      return;
    }

    // This can happen in edge cases where the user is
    // already dragging and element when it is detached.
    if (!self.parent) {
      return;
    }

    if (colorTimeout) {
      clearTimeout(colorTimeout);
    }
    Dashboard.horizontalSplitterUserCtrl = true;
    colorTimeout = setTimeout(() => {
      if (blessedDeps.dashboard) {
        blessedDeps.dashboard.splitter.style.bg = blessedDeps.dashboard.splitter.style.oldBg;
        blessedDeps.dashboard.splitter.style.transparent = false;
        colorTimeout = undefined;
        blessedDeps.dashboard.redraw();
      }
    }, 50);

    if (blessedDeps.dashboard) {
      if (!blessedDeps.dashboard?.splitter?.style?.oldBg) {
        blessedDeps.dashboard.splitter.style.oldBg = blessedDeps.dashboard.splitter.style.bg;
      }

      if (blessedDeps?.dashboard?.maxColumnWidth && data.x > blessedDeps?.dashboard?.maxColumnWidth) {
        blessedDeps.dashboard.splitter.style.bg = 'red';
        blessedDeps.dashboard.splitter.style.transparent = true;
      } else {
        blessedDeps.dashboard.splitter.style.bg = [80, 80, 80];
      }

      blessedDeps.dashboard?.resizeWidgets(blessedDeps.dashboard?.calcTableInfo());
    }
    // blessedDeps.dashboard.render();

    const ox = self._drag.x, px = self.parent.aleft, x = data.x - px - ox;

    blessedDeps.splitterOverride = data.x;

    if (self.position.right != null) {
      if (self.position.left != null) {
        self.width = '100%-' + (self.parent.width - self.width);
      }
      self.position.right = null;
    }

    self.rleft = x;

    self.screen.render();
  }),);

  return (this._draggable = true);
};
blessed.widget.Element
export {blessed, getBlessedDeps, contrib};
