import chalk from 'chalk';
import {Cenv} from './cenv';
import {cleanup} from "./utils";
import {Injectable} from '@nestjs/common';

const colors = {
  info: chalk.gray,
  infoDim: chalk.dim,
  infoBold: chalk.blueBright, //
  std: chalk.white,
  stdDim: chalk.dim,
  stdBold: chalk.whiteBright, //
  error: chalk.red,
  errorDim: chalk.yellow,
  errorBold: chalk.redBright, //
  errorHighlight: chalk.yellow,
  success: chalk.green,
  successDim: chalk.yellow,
  successBold: chalk.greenBright,
  successHighlight: chalk.yellow,
  alert: chalk.yellow,
  alertDim: chalk.yellow, //
  alertBold: chalk.yellowBright //
}
export {colors};

export enum LogLevel {
  NONE = 'NONE', MINIMAL = 'MINIMAL', DEBUG = 'DEBUG', INFO = 'INFO', VERBOSE = 'VERBOSE'
}

const colorSets = [[colors.error, colors.errorDim, colors.errorBold], [colors.info, colors.infoDim, colors.infoBold], [colors.success, colors.successDim, colors.successBold]]

export enum ColorSet {
  ERR = 0, INFO, GO
}


export const cleanTags = function(text: string) {
  if (!text) return '';
  return text
  .replace(/{(\/?)([\w\-,;!#]*)}/g, '')
  .replace(/\x1b\[[\d;]*m/g, '');
};

@Injectable()
export class CenvLog {
  static instance: CenvLog;
  static colors = colors;
  logLevel: LogLevel = LogLevel.INFO;
  static get logLevel() {
    return this.single.logLevel;
  }
  static set logLevel(level: LogLevel) {
    this.single.logLevel = level;
  }
  mouth: Mouth;

  public constructor() {
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

  static get single(): CenvLog {
    if (!CenvLog.instance) {
      CenvLog.instance = new CenvLog();
    }
    return this.instance;
  }

  get isVerbose() {
    return this.isLevel(LogLevel.VERBOSE);
  }

  static get isVerbose() {
    return this.single.isVerbose;
  }

  get isInfo() {
    return this.isLevel(LogLevel.INFO);
  }

  static get isInfo() {
    return this.single.isInfo;
  }

  get isAlert() {
    return this.isLevel(LogLevel.DEBUG);
  }

  static get isAlert() {
    return this.single.isAlert;
  }

  get isStdout() {
    return this.isLevel(LogLevel.MINIMAL);
  }

  static get isStdout() {
    return this.single.isStdout;
  }

  get isNone() {
    return this.isLevel(LogLevel.NONE);
  }

  colorType(type: string) {
    switch (type) {
      case 'incomplete':
        return {bold: colors.errorBold, color: colors.error, highlight: chalk.hex('#FFAAAA')};
      case 'deployed':
        return {bold: colors.successBold, color: colors.success, highlight: chalk.hex('#AAFFAA')};
      case 'needsFix':
        return {bold: chalk.whiteBright, color: chalk.white, highlight: chalk.white.dim};
    }
  }

  isLevel(level: LogLevel) {
    return Object.keys(LogLevel).indexOf(CenvLog.single.logLevel) >= Object.keys(LogLevel).indexOf(level);
  }

  getColorSet(colorSet: ColorSet = ColorSet.INFO) {
    const set = colorSets[colorSet];
    return {color: set[0], dim: set[1], bold: set[2]}
  }

  actionLine(description: string, title?: string, noun?: string, colorSet: ColorSet = ColorSet.INFO) {
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

  verbose(...text: string[]) {
    CenvLog.single?.mouth?.verbose(...text);
  }

  info(...text: any) {
    CenvLog.single?.mouth?.info(...text);
  }

  static info(...text: any) {
    CenvLog.single?.mouth?.info(...text)
  }

  err(...text: string[]) {
    CenvLog.single?.mouth?.err(...text);
  }

  static err(...text: any) {
    CenvLog.single?.mouth?.err(...text)
  }

  alert(...text: string[]) {
    CenvLog.single?.mouth?.alert(...text);
  }

  static alert(...text: any) {
    CenvLog.single?.mouth?.alert(...text)
  }

  std(...text: string[]) {
    CenvLog.single?.mouth?.std(...text);
  }

  joinArray(strArray: any) {
    if (strArray instanceof Object) {
      return JSON.stringify(strArray, null, 2);
    }
    return Array.isArray(strArray) ? strArray.join(' ') : `${strArray}`;
  }

  logBase(message: any, logColor: chalk.Chalk | undefined, logType: string, stackName?: string, replicateToGlobal = false) {
    message = this.joinArray(message) as string;
    if (message === '' || !message) {
      return;
    }
    if (message && typeof message === 'string' && message?.endsWith('\n')) {
      message = message.substring(0, message.length - 1)
    }
    if (process.env.EXIT_ON_LOG && process.env.EXIT_ON_LOG === message) {
      const err = new Error();
      console.log(colors.info(err.stack));
      process.exit(10)
    }

    if (!Cenv.dashboard) {
      if (logColor) {
        console.log(logColor(message));
      } else {
        console.log(message);
      }
    } else {
      if (!Cenv.dashboard.log || !Cenv.dashboard.logErr) {
        CenvLog.single.catchLog(['Cenv.dashboard', Cenv.dashboard].join(': '))
      }

      let logFunc;
      switch (logType) {
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

  verboseLog(message: any, stackName?: string, replicateToGlobal = false): void {
    if (!this.isVerbose) {
      return
    }
    this.logBase(message, colors.std, 'stdout', stackName, replicateToGlobal);
  }

  log(message: any) {
    this.infoLog(message);
  }
  infoLog(message: any, stackName?: string, replicateToGlobal = false): void {
    if (!this.isInfo) {
      return;
    }
    this.logBase(message, colors.info, 'stdout', stackName, replicateToGlobal);
  }
  static infoLog(message: any, stackName?: string, replicateToGlobal = false): void {
    this.single.infoLog(message, stackName, replicateToGlobal);
  }

  errorLog(message: any, stackName?: string, replicateToGlobal = false): void {
    this.logBase(message, colors.error, 'stderr', stackName, replicateToGlobal);
  }
  static errorLog(message: any, stackName?: string, replicateToGlobal = false): void {
    this.single.errorLog(message, stackName, replicateToGlobal);
  }

  alertLog(message: any, stackName?: string, replicateToGlobal = false): void {
    if (!this.isAlert) {
      return;
    }
    this.logBase(message, colors.alert, 'stdout', stackName, replicateToGlobal);
  }

  static alertLog(message: any, stackName?: string, replicateToGlobal = false): void {
    this.single.alertLog(message, stackName, replicateToGlobal);
  }
  stdLog(message: any, stackName?: string, replicateToGlobal = false): void {
    if (!this.isStdout) {
      return;
    }
    this.logBase(message, undefined, 'stdout', stackName, replicateToGlobal);
  }
  static stdLog(message: any, stackName?: string, replicateToGlobal = false): void {
    this.single.stdLog(message, stackName, replicateToGlobal);
  }


  catchLog(error: any): never {

    cleanup('catchLog');

    this.errorLog(error);

    if (!error || !error.stack) {
      this.errorLog(new Error().stack as string)
    } else {
      this.errorLog(error.stack)
    }

    process.exit(23);
  }

  static catchLog(error: any): never {
    this.single.catchLog(error);
    process.exit(34);
  }
}

export class Mouth {
  noun: string;
  stackName: string;

  constructor(noun: string, stackName: string) {
    this.noun = noun;
    this.stackName = stackName;
  }

  getAction(...text: string[]): string {
    if (text.length > 1) {
      const parts = {title: text.pop(), description: text.join(' ')};
      return CenvLog.single.actionLine(parts.description, parts.title as string, this.noun || this.stackName, ColorSet.INFO)
    }
    return CenvLog.single.
    actionLine(text[0], this.noun || this.stackName, undefined, ColorSet.INFO)
  }

  verbose(...text: string[]) {
    CenvLog.single.verboseLog(this.getAction(...text), this.stackName || this.noun);
  }

  info(...text: string[]) {
    CenvLog.single.infoLog(this.getAction(...text), this.stackName || this.noun);
  }

  err(...text: string[]) {
    CenvLog.single.errorLog(this.getAction(...text), this.stackName || this.noun, true);
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
