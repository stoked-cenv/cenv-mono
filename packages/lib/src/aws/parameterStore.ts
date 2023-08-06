import {
  DeleteParameterCommand,
  DeleteParametersCommand,
  GetParameterCommand,
  GetParametersByPathCommand,
  GetParametersCommand,
  PutParameterCommand,
  SSMClient,
  DeleteParametersCommandOutput
} from '@aws-sdk/client-ssm';

import {RateLimiter} from "limiter";

import {getConfigVars} from './appConfigData';
import {CenvLog} from '../log';
import {CenvFiles, EnvConfig, EnvVarsFile, File, GlobalEnvVarsFile, IParameter} from '../file';
import {CenvParams} from "../params";
import {existsSync} from 'fs';
import {decrypt} from './kms';
import {simplify, sleep} from '../utils'
import {Package} from "../package/package";

const ssmLimiter = new RateLimiter({tokensPerInterval: 5, interval: "second"});
let _client: SSMClient;

function getClient() {
  if (_client) {
    return _client;
  }
  const {AWS_REGION, AWS_ENDPOINT} = process.env;
  _client = new SSMClient({
                            region: AWS_REGION, endpoint: AWS_ENDPOINT
                          });
  return _client;
}

export async function getParameter(path: string, silent = false, decrypted = false) {
  const strippedPath = stripPath(path);
  try {
    const command = new GetParameterCommand({Name: strippedPath, WithDecryption: decrypted});
    const remainingRequests = await ssmLimiter.removeTokens(1);
    const response = await getClient().send(command);
    if (!response.Parameter) {
      return false;
    }
    const {Name, Value, Type, ARN} = response.Parameter as { Name: string, Value: string, Type: string, ARN: string};
    return {[strippedPath]: {Name, Value, Type, ARN}}
  } catch (e) {
    if (!silent) {
      CenvLog.single.errorLog(['parameter not found', strippedPath]);
      CenvLog.single.errorLog(['getParameterCommand error', e as string])
    }
  }
}

export async function getParameters(Names: string[], decrypted = false) {
  try {
    const command = new GetParametersCommand({Names: Names.map(stripPath), WithDecryption: decrypted});
    const remainingRequests = await ssmLimiter.removeTokens(1);
    const response = await getClient().send(command);

    const results: any = {};
    if (response.Parameters) {
      for (let i = 0; i < response.Parameters.length; i++) {
        const param = response.Parameters[i];
        results[param.Name as string] = {
          Value: param.Value && param.Type === 'SecureString' ? param.Value.replace('kms:alias/aws/ssm:', '') : param.Value,
          Type: param.Type,
          ARN: param.ARN
        };
      }
    }
    return results;
  } catch (e) {
    CenvLog.single.errorLog(['getParametersCommand error', e as string])
  }
}

export interface ParameterData {
  Path: string;
  Value?: string;
  Type: string;
  Arn?: string;
}

export interface Parameters {
  [Name: string]: ParameterData;
}

export function isEncrypted(value: string) {
  if (value === undefined) {
    return false;
  }
  return !!(value.match(/^--(ENC)=/));
}

export async function decryptValue(value: string): Promise<string> {
  value = value.replace(/^--(ENC)=/, '');
  if (value !== 'undefined') {
    return await decrypt(value);
  }
  CenvLog.single.catchLog('can not decrypt invalid value: ' + value)
  process.exit(329);
}

export async function getParametersByPath(path: string, decrypted = false) {
  try {
    const strippedPath = stripPath(path);
    let NextToken: string | undefined = undefined;
    const responseObj: any = {};

    while (true) {
      const command: GetParametersByPathCommand = new GetParametersByPathCommand({
                                                                                   NextToken,
                                                                                   Path: strippedPath,
                                                                                   Recursive: true,
                                                                                   WithDecryption: decrypted
                                                                                 });

      const remainingRequests = await ssmLimiter.removeTokens(1);
      const response = await getClient().send(command);
      if (response.Parameters) {
        await Promise.all(response.Parameters.map(async (param) => {
          const {Name, Type} = param;
          let Value = param.Value;
          if (Value && Name) {
            if (decrypted && isEncrypted(Value)) {
              Value = Value.replace(/^--(ENC)=/, '');
              if (Value !== 'undefined') {
                Value = await decrypt(Value as string);
              }
            }
            responseObj[Name] = {Name: Name.replace(`${strippedPath}/`, ''), Value, Type};
            return param;
          }
        }));
      }

      if (!response.NextToken) {
        break;
      }
      NextToken = response.NextToken;
    }

    return responseObj;
  } catch (e) {
    CenvLog.single.errorLog(['getParametersByPath error', e as string])
  }
}

// Allow 150 requests per hour (the Twitter search limit). Also understands
// 'second', 'minute', 'day', or a number of milliseconds

export async function putParameter(Name: string, Value: string, Overwrite = false, Type = 'String') {
  try {
    if (Name.indexOf('global') > -1 && Value === '') {
      new DeleteParameterCommand({Name: stripPath(Name)});
    } else {
      let KeyId: string | undefined = undefined;
      if (Type === 'SecureString') {
        KeyId = process.env.KMS_KEY
      }

      const command = new PutParameterCommand({Name: stripPath(Name), Value, Overwrite, Type, KeyId});
      const remainingRequests = await ssmLimiter.removeTokens(1);
      const response = await getClient().send(command);
    }
  } catch (e) {
    CenvLog.single.errorLog(['putParameterCommand error', Name, Value, e as string])
  }
}

export async function appendParameter(Name: string, Value: string, Type = 'String') {
  try {
    const getParamRes = await getParameter(stripPath(Name));
    if (!getParamRes){
      return;
    }
    const newValue = Object.values(getParamRes)[0].Value + Value;

    let KeyId: string| undefined = undefined;
    if (Type === 'SecureString') {
      KeyId = process.env.KMS_KEY
    }

    const command = new PutParameterCommand({Name: stripPath(Name), Value: newValue, Overwrite: true, Type, KeyId});
    const remainingRequests = await ssmLimiter.removeTokens(1);
    const response = await getClient().send(command);
  } catch (e) {
    CenvLog.single.errorLog(['appendParameter error', e as string])
  }
}

export function stripPath(path: string) {
  return path.replace(/[^0-9a-z\/\-_.]/gi, '');
}

export async function deleteParameters(Names: string[]) {
  try {
    await sleep(3);
    if (Names.length > 0) {
      const responseArr: DeleteParametersCommandOutput[] = [];
      for (let i = 0; i < Names.length; i += 10) {
        await sleep(3);
        const chunk = Names.slice(i, i + 10);
        const command = new DeleteParametersCommand({Names: chunk.map(stripPath)});
        const remainingRequests = await ssmLimiter.removeTokens(1);
        const response = await getClient().send(command);
        responseArr.push(response);
      }
      return responseArr;
    }
    return {};
  } catch (e) {
    CenvLog.single.errorLog(['deleteParametersCommand error', e as string])
  }
}

export async function deleteParametersByPath(path: string, outputPrefix = '', packageName = 'GLOBAL') {
  let total = 0;
  const parametersToDelete = await getParametersByPath(path, false);
  total += Object.keys(parametersToDelete).length;

  await deleteParameters(Object.keys(parametersToDelete));
  if (outputPrefix !== '') {
    outputPrefix += ' ';
  }
  Package.global.info(`${outputPrefix}deleted ${CenvLog.colors.infoBold(total)} parameters under ${CenvLog.colors.infoBold(path)}`, packageName);
  return;
}

export function envVarToKey(envVar: string) {
  let key = envVar.toLowerCase().replace(/\-[a-z]*/g, (match) => {
    const re = match.replace('-', '_')
    return re[0].toUpperCase() + re.slice(1);
  });
  key = key.replace(/\_[a-z]/g, (match) => {
    return match.replace('_', '/');
  });
  return key;
}

export function pathToEnvVarKey(key: string, rootPath: string): string {
  let newKey = key.replace(rootPath, '').replace(/\//g, '_');
  newKey = newKey.replace(/\.?([A-Z])/g, function (x, y) {
    return "-" + y.toLowerCase()
  });
  newKey = newKey.toLocaleUpperCase();
  return newKey.startsWith('_') ? newKey.substring(1) : newKey;
}

function convertToEnvVar(paramType: string, input: Parameters, rootPath: string, displaySecured = false) {
  const result: any = {};
  for (const [key, value] of Object.entries(input)) {
    const newKey = pathToEnvVarKey(key, rootPath);
    result[newKey] = {Path: key, Value: value.Value, Type: value.Type, ParamType: paramType};
  }
  return result;
}

export async function getStringList(path: string, silent = false) {
  const param = await getParameter(path, silent);
  if (param) {
    return param[path].Value.split(',');
  }
}

export async function getVarsByType(type: string, path: string, decrypted: boolean) {
  const params = await getParametersByPath(path, decrypted);
  return convertToEnvVar(type, params, path);
}

export async function listParameters(config: EnvConfig, decrypted: boolean, allGlobals = false, allGlobalEnvs = false): Promise<any> {
  try {
    const roots = CenvParams.GetRootPaths(config.ApplicationName, config.EnvironmentName);
    const appVars = await getVarsByType('app', roots.app, decrypted);
    const environmentVars = await getVarsByType('environment', roots.environment, decrypted);

    const res: any = {
      app: appVars, environment: environmentVars, global: {}, globalEnv: {}, allGlobals: {}, allGlobalEnvs: {}
    }

    res.allGlobals = allGlobals ? await getParametersByPath(roots.global, decrypted) : undefined;
    const globalParamPaths = await getStringList(roots.globalLink, true);
    if (globalParamPaths) {
      if (res.allGlobals) {
        const globalVarParams: any = {}
        globalParamPaths.map(p => globalVarParams[p] = res.allGlobals[p]);
        const globalVars = convertToEnvVar('global', globalVarParams, roots.global);
        res.global = {...globalVars, ...res.global};
      } else {
        const chunkSize = 10;
        for (let i = 0; i < globalParamPaths.length; i += chunkSize) {
          const chunk = globalParamPaths.slice(i, i + chunkSize);
          const globalVarParams = await getParameters(chunk, decrypted);
          const globalVars = convertToEnvVar('global', globalVarParams, roots.global);
          res.global = {...globalVars, ...res.global};
        }
      }
    } else {
      res.global = {};
    }

    res.allGlobalEnvs = allGlobalEnvs ? await getParametersByPath(roots.globalEnv, decrypted) : undefined;
    const globalEnvParamPaths = await getStringList(roots.globalEnvLink, true);
    if (globalEnvParamPaths) {
      if (res.allGlobalEnvs) {
        const globalEnvVarParams: any = {}
        globalEnvParamPaths.map(p => globalEnvVarParams[p] = res.allGlobalEnvs[p]);
        const globalEnvVars = convertToEnvVar('globalEnv', globalEnvVarParams, roots.globalEnv);
        res.globalEnv = {...globalEnvVars, ...res.globalEnv};
      } else {
        const chunkSize = 10;
        for (let i = 0; i < globalEnvParamPaths.length; i += chunkSize) {
          const chunk = globalEnvParamPaths.slice(i, i + chunkSize);
          const globalEnvVarParams = await getParameters(chunk, decrypted);
          const globalEnvVars = convertToEnvVar('globalEnv', globalEnvVarParams, roots.globalEnv);
          res.globalEnv = {...globalEnvVars, ...res.globalEnv};
        }
      }
    } else {
      res.globalEnv = {};
    }
    if (allGlobals) {
      res.allGlobals = convertToEnvVar('global', res.allGlobals, roots.global);
    }
    if (allGlobalEnvs) {
      res.allGlobalEnvs = convertToEnvVar('globalEnv', res.allGlobalEnvs, roots.globalEnv);
    }
    return res;
  } catch (e) {
    CenvLog.single.errorLog(['listParameters error', e as string]);
  }
}

export const enum UpsertResult {
  CREATED = 'CREATED', UPDATED = 'UPDATED', SKIPPED = 'SKIPPED',
}

export async function upsertParameter(config: any, parameter: {
  [x: string]: IParameter
}, type: string): Promise<UpsertResult> {
  const [paramPath, param] = Object.entries(parameter)[0];
  let linkOnly = false;
  if (!param.Value) {
    if (!paramPath.startsWith('/global')) {
      CenvLog.single.alertLog(` - skipping ${CenvLog.colors.alertBold(paramPath)} as it has no value`);
      return UpsertResult.SKIPPED;
    } else {
      linkOnly = true;
    }
  }
  const getParamRes = await getParameter(paramPath, true, true);
  let result = UpsertResult.SKIPPED;
  // if no parameter exists, write it

  if (!linkOnly) {
    if (!getParamRes) {
      CenvLog.info(` - writing ${param.Type === 'SecureString' ? 'encrypted ' : ''}parameter ${CenvLog.colors.infoBold(param.Name)} with value ${CenvLog.colors.infoBold(param.Value)}`);
      await putParameter(paramPath, param.Value, false, param.Type);
      result = UpsertResult.CREATED;

      // if parameter exists, check to see if the value has changed
    } else if (param.Value !== Object.values(getParamRes)[0].Value) {
      CenvLog.info(`- updating parameter ${param.Type === 'SecureString' ? 'encrypted ' : ''}${CenvLog.colors.infoBold(param.Name)} with value ${CenvLog.colors.infoBold(param.Value)}`);
      await putParameter(paramPath, param.Value, true, param.Type);
      result = UpsertResult.UPDATED;
    }
  }

  // if global parameter exists, check to see if the link is in the values list
  const rootPaths = CenvParams.GetRootPaths(config.ApplicationName, config.EnvironmentName);

  if (param.ParamType.startsWith('global')) {
    const linkPath = param.ParamType === 'global' ? rootPaths['globalLink'] : rootPaths['globalEnvLink'];
    const link: any = await getParameter(linkPath, true)
    if (!link) {
      CenvLog.info(` - creating link parameter ${CenvLog.colors.infoBold(linkPath)} with value ${CenvLog.colors.infoBold(paramPath)}`);
      await putParameter(linkPath, paramPath, false, 'StringList');
      result = UpsertResult.UPDATED;
    } else {
      const linkNode = link[linkPath];
      if (linkNode && linkNode.Value.indexOf(paramPath) === -1) {
        CenvLog.info(` - appending link parameter ${CenvLog.colors.infoBold(linkPath)} with value ${CenvLog.colors.infoBold(paramPath)}`);
        await appendParameter(linkPath, `,${paramPath}`);
        result = UpsertResult.UPDATED;
      }
    }
  }
  if (result !== UpsertResult.SKIPPED && !linkOnly) {
    updateTemplates(true, pathToEnvVarKey(param.Name, paramPath), type, param.Value)
  }
  return result;
}

export function updateTemplates(add: boolean, envVar: string, type: string, value?: string) {
  let file: any = null;
  let path: string | null = null;
  if (type === 'environment') {
    file = EnvVarsFile;
    path = CenvFiles.PATH;
  } else if (type === 'globalEnv') {
    file = GlobalEnvVarsFile;
    path = CenvFiles.GLOBAL_PATH;
  }
  if (file !== null) {
    if (!existsSync(file.TEMPLATE_PATH)) {
      file.save({[envVar]: value}, true, file.TEMPLATE, path);
    } else {
      const varData = file.read(file.TEMPLATE_PATH, file.SCHEMA, true) || {};
      const hasIt = varData ? Object.keys(varData).includes(envVar) : false;
      if (add && !hasIt) {
        varData[envVar] = value || 'string';
        file.save(varData, true, file.TEMPLATE, path);
      } else if (!add && hasIt) {
        delete varData[envVar];
        File.save(varData, false, file.TEMPLATE, path!);
      }
    }
  }
}

function printYamlPretty(yamlData: any, format: string, printPkg?: string) {
  const space = printPkg ? '  ' : '';
  if (printPkg) {
    printPkgName(printPkg);
  }
  for (const [key, value] of Object.entries(yamlData)) {
    const val: any = value;
    if (format === 'simple') {
      const keyVal = val.Value ? val.Value : val;
      console.log(`${space}${CenvLog.colors.infoBold(key)}: ${keyVal}`);
    } else {
      console.log(`${space}${CenvLog.colors.infoBold(key)}: `);
      console.log(`${space}  ${CenvLog.colors.infoBold('Value')}: ${val.Value}`);
      console.log(`${space}  ${CenvLog.colors.infoBold('Path')}: ${val.Path}`);
      console.log(`${space}  ${CenvLog.colors.infoBold('Type')}: ${val.Type}`);
    }
  }
  if (printPkg) {
    console.log('')
  }
}

function printPkgName(printPkg: string) {
  if (printPkg) {
    console.log(CenvLog.colors.successBold(printPkg));
  }
}

export async function getParams(config: any, type = 'all', format: string, decrypted = false, deployed = false, silent = false, includeTemplates = false) {
  if (!config) {
    config = CenvFiles.GetConfig();
  }
  const printPkg = format.endsWith('-pkg') ? config.ApplicationName : undefined;
  format = format.replace('-pkg', '');

  let parameters: any = {};
  if (!deployed) {
    parameters = await listParameters(config, decrypted);
  } else {
    parameters = await getConfigVars(config.ApplicationName, true);
  }
  let output = {};
  if (deployed) {
    type = 'deployed';
    output = parameters;
  }
  let noTypeSet = false;
  if (type === 'all') {
    output = {...parameters.app, ...parameters.environment, ...parameters.global, ...parameters.globalEnv};
  } else if (type === 'allTyped') {
    if (parameters) {
      if (!silent) {
        printYamlPretty(output, format, printPkg);
      }
      return {
        ...CenvFiles.AllTyped(parameters),
        environmentTemplate: parameters.environment,
        globalEnvironmentTemplate: parameters.globalEnv
      };
    }
  } else if (type === 'app' || type === 'environment' || type === 'global' || type === 'globalEnv') {
    output = parameters[type] ? parameters[type] : parameters;
  } else if (type === 'deployed') {

  } else {
    noTypeSet = true;
  }

  let result = noTypeSet ? {...parameters.app, ...parameters.environment, ...parameters.global, ...parameters.globalEnv} : output;
  if (format === 'simple') {
    result = simplify(result, printPkg);
  }
  if (!silent) {
    printYamlPretty(result, format, printPkg);
  }

  return result;
}
