import chalk, { Chalk } from 'chalk';
import { Cenv } from './cenv';
import {cleanup} from "./utils";

const info = chalk.gray;
const infoBold = chalk.blueBright;
const infoDim = chalk.dim;
const errorInfo = chalk.red;
const errorBold = chalk.redBright;
const errorDim = chalk.hex('#800000')
const infoInput = chalk.green;
const stdGreen = infoInput;
const green = stdGreen;
const inputBold = chalk.greenBright;
const stdGreenBold = inputBold;
const greenDim = chalk.green.dim;
const greenBold = stdGreenBold;
const infoAlert = chalk.yellow;
const infoAlertBold = chalk.yellowBright.underline;
const verbose = chalk.cyan;
const orange  = chalk.hex('#FFA500');
const stdWhite = chalk.white;
export { stdGreen, stdGreenBold, stdWhite, infoBold, info, infoDim, errorInfo, infoInput, errorBold, infoAlert, infoAlertBold, errorDim, inputBold, orange, green, greenBold, greenDim };

const colors = {
  info: chalk.hex('#888888'),
  infoDim: chalk.hex('#555555'),
  infoBold: chalk.bold.hex('#AAAAAA'),
  std: chalk.white,
  stdDim: chalk.dim,
  stdBold: chalk.bold.whiteBright,
  error: chalk.red,
  errorDim: chalk.hex('#800000'),
  errorBold: chalk.bold.redBright,
  errorHighlight: chalk.hex('#FFAAAA'),
  success: chalk.green,
  successDim: chalk.hex('#009900'),
  successBold: chalk.greenBright,
  successHighlight: chalk.hex('#AAFFAA'),
  alert: chalk.yellow,
  alertDim: chalk.yellow.dim,
  alertBold: chalk.yellowBright.underline
}
export { colors };

export enum LogLevel {
  NONE = 'NONE',
  MINIMAL = 'MINIMAL',
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  VERBOSE = 'VERBOSE'
}

const colorSets = [
  [errorInfo, errorDim, errorBold],
  [info, infoDim, infoBold],
  [green, greenDim, greenBold]
]

export enum ColorSet {
  ERR = 0,
  INFO,
  GO
}

export class CenvLog {
  static instance: CenvLog;
  mouth: Mouth;
  static logLevel: LogLevel;
  private constructor() {
    this.mouth = new Mouth('log', 'GLOBAL');
    CenvLog.instance = this;
  }

  /*
  static incrementColor() {
    this[this.colors[this.currentColor]] += 5;
    if (this[this.colors[this.currentColor]] > 255) {
      this[this.colors[this.currentColor]] = 0
    }
  }

  static getHex() {
    return `#${this.red.toString(16)}${this.green.toString(16)}${this.blue.toString(16)}`
  }

  static red = 255;
  static green = 255;
  static blue = 255;

  static colors: string[] = ['red', 'green', 'blue'];
  static currentColor: number = 0;

  static getRgb() {
    return this.colors[this.currentColor];
  }

  static nextColor() {
    this.currentColor += 1;
    if (this.currentColor === this.colors.length) {
      this.currentColor = 0;
    }
  }

   */

  static colorType(type: string) {
    switch(type) {
      case 'incomplete':
      return { bold: errorBold, color: errorInfo, highlight: chalk.hex('#FFAAAA') };
      case 'deployed':
      return { bold: greenBold, color: green, highlight: chalk.hex('#AAFFAA') };
      case 'needsFix':
      return { bold: chalk.whiteBright, color: chalk.white, highlight: chalk.white.dim };
    }
  }

  static get single(): CenvLog {
    if (!CenvLog.instance) {
      CenvLog.instance = new CenvLog();
    }
    return this.instance;
  }

  joinArray(strArray: any) {
    return Array.isArray(strArray) ? strArray.join(' ') : strArray;
  }

  logBase(message: string | string[], logColor: Chalk, logType: string, stackName: string = undefined, replicateToGlobal = false) {
    message = this.joinArray(message) as string;
    if (message === '' || !message) {
      return;
    }
    if (!(message.endsWith instanceof Function)) {
      return;
    }
    if (message && message?.endsWith('\n')) {
      message = message.substring(0, message.length - 1)
    }
    if (process.env.EXIT_ON_LOG && process.env.EXIT_ON_LOG === message) {
      const err = new Error();
      console.log(infoInput(err.stack));
      process.exit(10)
    }

    if (!Cenv.dashboard) {
      if (logColor) {
        console.log(logColor(message));
      }
    } else {
      if (!Cenv.dashboard.log || !Cenv.dashboard.logErr) {
        CenvLog.single.catchLog(['Cenv.dashboard', Cenv.dashboard].join(': '))
      }

      let logFunc;
      switch(logType) {
        case 'stdout':
          logFunc = Cenv.dashboard.log.bind(Cenv.dashboard);
          break;
        case 'stderr':
          logFunc = Cenv.dashboard.logErr.bind(Cenv.dashboard)
          break;
        case 'stdtemp':
          default:
            if (process.env.CENV_STDTEMP) {
              logFunc = Cenv.dashboard.logTemp.bind(Cenv.dashboard);
            } else {
              logFunc = Cenv.dashboard.log.bind(Cenv.dashboard);
            }
      }

      logFunc(stackName ? stackName : 'GLOBAL', message);
      if (replicateToGlobal && stackName) {
        logFunc('GLOBAL', message);
      }
    }
  }

  static isLevel(level: LogLevel) {
    return Object.keys(LogLevel).indexOf(CenvLog.logLevel) >= Object.keys(LogLevel).indexOf(level);
  }

  static get isVerbose() {
    return this.isLevel(LogLevel.VERBOSE);
  }


  static get isInfo() {
    return this.isLevel(LogLevel.INFO);
  }

  static get isAlert() {
    return this.isLevel(LogLevel.DEBUG);
  }

  static get isStdout() {
    return this.isLevel(LogLevel.MINIMAL);
  }

  static get isNone() {
    return this.isLevel(LogLevel.NONE);
  }

  verboseLog(message: string | string[], stackName: string = undefined, replicateToGlobal= false): void {
    if (!CenvLog.isVerbose) return
    this.logBase(message, verbose, 'stdout', stackName, replicateToGlobal);
  }

  infoLog(message: string | string[], stackName: string = undefined, replicateToGlobal= false): void {
    if (!CenvLog.isInfo) return;
    this.logBase(message, info, 'stdout', stackName, replicateToGlobal);
  }

  tempLog(message: string | string[], stackName: string = undefined, replicateToGlobal= false): void {
    if (!CenvLog.isInfo && process.env.CENV_STDTEMP) {
      this.logBase(message, undefined, 'stdtemp', stackName, replicateToGlobal);
    } else {
      this.infoLog(message, stackName, replicateToGlobal);
    }
  }

  errorLog(message: string | string[], stackName: string = undefined, replicateToGlobal= false): void {
    this.logBase(message, errorInfo, 'stderr', stackName, replicateToGlobal);
  }

  alertLog(message: string | string[], stackName: string = undefined, replicateToGlobal= false): void {
    if (!CenvLog.isAlert) return;
    this.logBase(message, infoAlert, 'stdout', stackName, replicateToGlobal);
  }

  stdLog(message: string | string[], stackName: string = undefined, replicateToGlobal= false): void {
    if (!CenvLog.isStdout) return;
    this.logBase(message, chalk.white, 'stdout', stackName, replicateToGlobal);
  }

  catchLog(error: any) {

    cleanup('catchLog');

    this.errorLog(error);

    if (!error || !error.stack)
      this.errorLog(new Error().stack)
    else
      this.errorLog(error.stack)

    process.exit(23);
  }

  static getColorSet(colorSet: ColorSet = ColorSet.INFO) {
    const set = colorSets[colorSet];
    return { color: set[0], dim: set[1], bold: set[2] }
  }

  static actionLine(description: string, title: string = undefined, noun: string = undefined, colorSet: ColorSet = ColorSet.INFO) {
    const set = this.getColorSet(colorSet);
    const regex = /\[(.*?)\]/gm;
    let m;

    let newStr = description;
    while ((m = regex.exec(description)) !== null) {
      // handle infinite loops with zero-width matches
      if (m.index === regex.lastIndex) {
        regex.lastIndex++;
      }
      newStr = newStr.replace(m[0], `[${set.bold(m[1])}]`);
    }
    if (title?.length) {
      title = `${set.color(title)}: `;
    }

    if (noun?.length) {
      noun = `[${set.dim(noun)}] `;
    } else {
      noun = '';
    }

    return `${noun}${title}${set.color(newStr)}`;
  }

  static verbose(...text : string[]) {
    CenvLog.single?.mouth?.verbose(...text);
  }

  static info(...text : string[]) {
    CenvLog.single?.mouth?.info(...text);
  }

  static err(...text: string[]) {
    CenvLog.single?.mouth?.err(...text);
  }

  static alert(...text: string[]) {
    CenvLog.single?.mouth?.alert(...text);
  }

  static std(...text: string[]) {
    CenvLog.single?.mouth?.std(...text);
  }
}

export class Mouth {
  noun: string;
  stackName: string;
  constructor(noun: string, stackName: string = undefined) {
    this.noun = noun;
    this.stackName = stackName;
  }
  getAction(...text : string[]): string {
    if (text.length > 1) {
      const parts = { title: text.pop(), description: text.join(' ') };
      return CenvLog.actionLine(parts.description, parts.title, this.noun || this.stackName, ColorSet.INFO)
    }
    return CenvLog.actionLine(text[0],this.noun || this.stackName, undefined, ColorSet.INFO)
  }
  verbose(...text : string[]) {
    CenvLog.single.verboseLog(this.getAction(...text), this.stackName || this.noun);
  }
  info(...text : string[]) {
    CenvLog.single.infoLog(this.getAction(...text), this.stackName || this.noun);
  }
  err(...text: string[]) {
    CenvLog.single.errorLog(this.getAction(...text), this.stackName || this.noun,true);
  }
  alert(...text: string[]) {
    CenvLog.single.alertLog(this.getAction(...text), this.stackName || this.noun);
  }
  std(...text: string[]) {
    CenvLog.single.stdLog(this.getAction(...text), this.stackName || this.noun, true);
  }

  stdPlain(...text: string[]) {
    CenvLog.single.stdLog(text, this.stackName || this.noun);
  }
}

/*
export class Logs {
  static err: string[] = [];
  static std: string[] = [];
  static debug: string[] = [];
  static alert: string[] = [];
  static verbose: string[] = [];

  static push(type: string, ...message: string[]) {
    const arr = this[type];
    if (arr?.length >= 5) {
      arr.shift();
    }
    arr.push(message.join(' '));
  }
}
*/