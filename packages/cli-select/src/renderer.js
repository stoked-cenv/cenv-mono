"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _readline = _interopRequireDefault(require("readline"));

var _ansiEscapes = require("ansi-escapes");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Response renderer
 */
class Renderer {
  /**
   * Renderer constructor
   *
   * @param {object} options - renderer options
   * @param {any} stream - stream to write to (optional)
   */
  constructor(options, stream = process.stdout) {
    this.options = options;
    this.stream = stream;
    this.values = [];
    this.initialRender = true;
    this.legend = options?.legend;
    this.legendColors = options?.legendColors;
    this.keyFunctions = options?.keyFunctions;
    this.additionalClearLines = options?.legend && options?.keyFunctions?.map((keyFunction) => keyFunction.legend).length + 2 || 0;
  }
  /**
   * Set the available values
   *
   * @param {array} values - all available values
   */


  setValues(values) {
    this.values = values;
  }
  /**
   * Render the values
   *
   * @param {number} selectedValue - selected value (optional)
   */


  renderLegend() {
    if (!this.legend) {
      return;
    }

    const title = 'KEY LEGEND\n';
    const coloredLegend = this.legendColors?.title ? this.legendColors.title(title) : title;
    this.stream.write(coloredLegend);
    this.keyFunctions.forEach((keyFunction) => {
      if (keyFunction.legend) {
        const keyLegend = `\t${keyFunction.keys.join(', ')}: ${keyFunction.legend}\n`;
        const legendColored = this.legendColors?.keys ? this.legendColors.keys(keyLegend) : keyLegend;
        this.stream.write(legendColored);
      }
    });
    this.stream.write('\n');

  }
  render(selectedValue = 0) {
    if (this.initialRender) {
      // hide the cursor initially
      this.initialRender = false;
      this.stream.write(_ansiEscapes.cursorHide);
      this.renderLegend();
    } else {
      // remove previous lines and values
      this.stream.write((0, _ansiEscapes.eraseLines)(this.values.length));
    } // output the current values


    this.values.forEach((value, index) => {
      const symbol = selectedValue === index ? this.options.selected : this.options.unselected;
      const indentation = ' '.repeat(this.options.indentation);
      const renderedValue = this.options.valueRenderer(value, selectedValue === index);
      const end = index !== this.values.length - 1 ? '\n' : '';
      this.stream.write(indentation + symbol + ' ' + renderedValue + end);
    });
  }
  /**
   * Cleanup the console at the end
   */


  cleanup() {
    this.stream.write((0, _ansiEscapes.eraseLines)(this.values.length + this.additionalClearLines));
    this.stream.write(_ansiEscapes.cursorShow);
  }

}

exports.default = Renderer;