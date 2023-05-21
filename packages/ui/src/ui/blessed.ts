import blessed from 'blessed';
import contrib from 'blessed-contrib';

const blessedDeps = { dashboard: undefined, splitterOverride: null };
let colorTimeout;
const widgetSpacing = 0;

function getBlessedDeps() {
  return blessedDeps;
}

blessed.List.prototype.move = async function (offset) {
  this.select(this.selected + offset);
};

function MergeRecursive(obj1, obj2) {
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

contrib.grid.prototype.set = function (row, col, rowSpan, colSpan, obj, opts) {
  if (obj instanceof contrib.grid) {
    throw (
      'Error: A Grid is not allowed to be nested inside another grid.\r\n' +
      'Note: Release 2.0.0 has breaking changes. Please refer to the README or to https://github.com/yaronn/blessed-contrib/issues/39'
    );
  }

  const top = row * this.cellHeight + this.options.dashboardMargin;
  const left = col * this.cellWidth + this.options.dashboardMargin;

  //var options = JSON.parse(JSON.stringify(opts));
  let options: any = {};
  options = MergeRecursive(options, opts);
  options.top = top + '%';
  options.left = left + '%';
  options.width = this.cellWidth * colSpan - widgetSpacing + '%';
  options.height = this.cellHeight * rowSpan - widgetSpacing + '%';
  if (!options.hideBorder)
    options.border = { type: 'line', fg: this.options.color || 'cyan' };

  const instance = obj(options);
  this.options.screen.append(instance);
  return instance;
};

blessed.Element.prototype.enableDrag = function (verify) {
  const self = this;

  if (this._draggable) return true;

  if (typeof verify !== 'function') {
    verify = function () {
      return true;
    };
  }

  this.enableMouse();

  this.on(
    'mousedown',
    (this._dragMD = function (data) {
      if (self.screen._dragging) return;
      if (!verify(data)) return;
      self.screen._dragging = self;

      self._drag = {
        x: data.x - self.aleft,
        y: data.y - self.atop,
      };
      self.setFront();
    }),
  );

  this.onScreenEvent(
    'mouse',
    (this._dragM = function (data) {
      if (self.screen._dragging !== self){
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
      colorTimeout = setTimeout(() => {
        blessedDeps.dashboard.splitter.style.bg = blessedDeps.dashboard.splitter.style.oldBg;
        blessedDeps.dashboard.splitter.style.transparent = false;
        colorTimeout = undefined;
        blessedDeps.dashboard.redraw();
      }, 50);

      if (!blessedDeps.dashboard.splitter.style.oldBg) {
        blessedDeps.dashboard.splitter.style.oldBg = blessedDeps.dashboard.splitter.style.bg;
      }

      if (data.x > blessedDeps.dashboard.maxColumnWidth) {
        blessedDeps.dashboard.splitter.style.bg = 'red';
        blessedDeps.dashboard.splitter.style.transparent = true;
      } else {
        blessedDeps.dashboard.splitter.style.bg = [80, 80, 80];
      }

      blessedDeps.dashboard.resizeWidgets();
      blessedDeps.dashboard.render();

      const ox = self._drag.x,
        px = self.parent.aleft,
        x = data.x - px - ox;

      blessedDeps.splitterOverride = data.x;

      if (self.position.right != null) {
        if (self.position.left != null) {
          self.width = '100%-' + (self.parent.width - self.width);
        }
        self.position.right = null;
      }

      self.rleft = x;

      self.screen.render();
    }),
  );

  return (this._draggable = true);
};

export { blessed, getBlessedDeps };
export { contrib };
