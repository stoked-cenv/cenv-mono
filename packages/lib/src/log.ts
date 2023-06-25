import chalk, { Chalk } from 'chalk';
import { CenvParams } from './params';
import {cleanup, destroyUI, killRunningProcesses} from "./utils";

const info = chalk.gray;
const infoBold = chalk.blueBright.underline;
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

  static colors = ['red', 'green', 'blue'];
  static currentColor = 0;

  static getRgb() {
    return this.colors[this.currentColor];
  }

  static nextColor() {
    this.currentColor += 1;
    if (this.currentColor === this.colors.length) {
      this.currentColor = 0;
    }
  }

  static colorType(type) {
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

  joinArray(strArray) {
    return Array.isArray(strArray) ? strArray.join(' ') : strArray;
  }

  logBase(message: string | string[], logColor: Chalk, logType: string, stackName: string = undefined, replicateToGlobal = false) {
    message = this.joinArray(message) as string;
    if (message === '' || !message) {
      return;
    }
    if (process.env.EXIT_ON_LOG && process.env.EXIT_ON_LOG === message) {
      const err = new Error();
      console.log(infoInput(err.stack));
      process.exit(10)
    }

    if (!CenvParams.dashboard) {
      console.log(logColor(message));
    } else {
      //console.log(logColor(message));
      if (!CenvParams.dashboard.log || !CenvParams.dashboard.logErr) {
        CenvLog.single.catchLog(['CenvParams.dashboard', CenvParams.dashboard].join(': '))
      }
      const logFunc = logType === 'stdout' ? CenvParams.dashboard.log.bind(CenvParams.dashboard) : CenvParams.dashboard.logErr.bind(CenvParams.dashboard);
      logFunc(stackName ? stackName : 'GLOBAL', message);
      if (replicateToGlobal && stackName) {
        logFunc('GLOBAL', message);
      }
    }
  }

  verboseLog(message: string | string[], stackName: string = undefined, replicateToGlobal= false): void {
    if (Object.keys(LogLevel).indexOf(CenvLog.logLevel) < Object.keys(LogLevel).indexOf(LogLevel.VERBOSE)) return
    this.logBase(message, verbose, 'stdout', stackName, replicateToGlobal);
    //Logs.push('verbose', joinArray(message) as string);
  }

  infoLog(message: string | string[], stackName: string = undefined, replicateToGlobal= false): void {
    if (Object.keys(LogLevel).indexOf(CenvLog.logLevel) < Object.keys(LogLevel).indexOf(LogLevel.INFO)) return;
    this.logBase(message, info, 'stdout', stackName, replicateToGlobal);
    //Logs.push('debug', joinArray(message) as string);
  }

  errorLog(message: string | string[], stackName: string = undefined, replicateToGlobal= false): void {
    this.logBase(message, errorInfo, 'stderr', stackName, replicateToGlobal);
    //Logs.push('err', joinArray(message) as string);
  }


  alertLog(message: string | string[], stackName: string = undefined, replicateToGlobal= false): void {
    if (Object.keys(LogLevel).indexOf(CenvLog.logLevel) < Object.keys(LogLevel).indexOf(LogLevel.DEBUG)) return;
    this.logBase(message, infoAlert, 'stdout', stackName, replicateToGlobal);
    //Logs.push('alert', joinArray(message) as string);
  }


  stdLog(message: string | string[], stackName: string = undefined, replicateToGlobal= false): void {
    if (Object.keys(LogLevel).indexOf(CenvLog.logLevel) < Object.keys(LogLevel).indexOf(LogLevel.MINIMAL)) return;
    this.logBase(message, chalk.white, 'stdout', stackName, replicateToGlobal);
    //Logs.push('std', joinArray(message) as string);
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

  static actionLine(description, title: string = undefined, noun = undefined, colorSet: ColorSet = ColorSet.INFO) {
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

    if (noun.length) {
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

  static err(...text) {
    CenvLog.single?.mouth?.err(...text);
  }

  static alert(...text) {
    CenvLog.single?.mouth?.alert(...text);
  }

  static std(...text) {
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
    return CenvLog.actionLine(text[0],this.noun || this.stackName, ColorSet.INFO)
  }
  verbose(...text : string[]) {
    CenvLog.single.verboseLog(this.getAction(...text), this.stackName || this.noun);
  }
  info(...text : string[]) {
    CenvLog.single.infoLog(this.getAction(...text), this.stackName || this.noun);
  }
  err(...text) {
    CenvLog.single.errorLog(this.getAction(...text), this.stackName || this.noun,true);
  }
  alert(...text) {
    CenvLog.single.alertLog(this.getAction(...text), this.stackName || this.noun);
  }
  std(...text) {
    CenvLog.single.stdLog(this.getAction(...text), this.stackName || this.noun, true);
  }
}

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
