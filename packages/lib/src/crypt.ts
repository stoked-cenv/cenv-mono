import {CenvLog} from "./log";
import {readFileSync, writeFileSync} from "fs";
import {decrypt} from "./aws";
import path from "path";
import {BaseCommandOptions} from "./cenv";


export interface CryptCommandOptions extends BaseCommandOptions {
  file?: string
  output?: string
}

export const crypt = async (params: string[], options: CryptCommandOptions, cryptFunc: (cryptData) => Promise<string>) => {
  try {
    if (options?.file && params?.length) {
      CenvLog.single.errorLog('Cannot specify both file and param(s) to decrypt');
    }
    if (options?.file) {
      const fileData = readFileSync(options.file, 'utf8');
      const crypted = await cryptFunc(fileData);
      if (options?.output) {
        writeFileSync(options.output, crypted, 'utf8');
      } else {
        console.log(crypted);
      }
      process.exit(0);
    }
    if (params?.length) {
      const output = options?.output;
      let outputParsed: path.ParsedPath | undefined = undefined;
      if (params?.length > 1 && options?.output) {
        outputParsed = path.parse(options.output);

      }
      for (const param in params) {
        const crypted = await cryptFunc(params[param]);
        if (options?.output) {
          if (outputParsed) {
            const filename = path.join(outputParsed.dir, `${outputParsed.name}.${param}.${outputParsed.ext}`);
            writeFileSync(filename, crypted, 'utf8');
          } else {
            writeFileSync(options?.output, crypted, 'utf8');
          }
        } else {
          console.log(crypted);
        }
      }
    }
  } catch (e) {
    console.log(CenvLog.colors.error(e));
  }
}