import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  FunctionCode,
  GetFunctionCommand,
  InvokeCommand,
  LambdaClient,
  ListFunctionsCommand,
  UpdateFunctionConfigurationCommand,
  FunctionConfiguration
} from '@aws-sdk/client-lambda';
import {fromUtf8, toUtf8} from '@aws-sdk/util-utf8-node';
import {CenvLog} from '../log';
import { readFileSync } from 'fs';

let _client: LambdaClient;

function getClient() {
  if (_client) {
    return _client;
  }
  const {AWS_REGION, AWS_ENDPOINT} = process.env;

  _client = new LambdaClient({
                               region: AWS_REGION, endpoint: AWS_ENDPOINT
                             });
  return _client;
}

export async function updateConfiguration(FunctionName: string, envVars: any) {
  const cmd = new UpdateFunctionConfigurationCommand({FunctionName, Environment: {Variables: {...envVars}}});
  const res = await getClient().send(cmd);
  if (res) {
    return `lambda configuration update: ${FunctionName}`;
  }
  return false;
}

export async function createFunction(name: string, zipFile: string, lambdaRole: string, envVars: any = {}, tags: Record<string, string> = {}) {
  try {

    if (process.env.AWS_ENDPOINT) {
      envVars['AWS_ENDPOINT'] = process.env.AWS_ENDPOINT;
    }
    const cmd = new CreateFunctionCommand({
      Runtime: 'nodejs18.x',
      Code: { ZipFile: readFileSync(zipFile) },
      Handler: 'index.handler',
      Role: lambdaRole,
      FunctionName: name,
      Environment: envVars,
      Tags: tags,
      Timeout: 20
                                          });
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
  } catch (e) {
    CenvLog.single.errorLog(`createFunction [${name}] error: ${CenvLog.colors.errorBold(e as string)}`);
  }
  return false
}

export async function deleteFunction(FunctionName: string) {
  try {

    const cmd = new DeleteFunctionCommand({FunctionName});
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
  } catch (e) {
    CenvLog.single.errorLog(`deleteFunction error: ${CenvLog.colors.errorBold(e as string)}`);
  }
  return false
}

export async function invoke(FunctionName: string, PayloadString: string) {
  try {
    const cmd = new InvokeCommand({
                                    FunctionName, Payload: fromUtf8(PayloadString), LogType: 'Tail'
                                  });
    const {Payload} = await getClient().send(cmd);
    if (Payload) {
      const parsedPayload = JSON.parse(toUtf8(Payload));
      return parsedPayload;
    }
  } catch (e) {
    CenvLog.single.errorLog(`invoke ${FunctionName} error: ${CenvLog.colors.errorBold(e as string)}`);
  }
  return false
}

export async function getFunction(FunctionName: string, silent = true) {
  try {
    const cmd = new GetFunctionCommand({FunctionName});
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
  } catch (e) {
    if (!silent) {
      CenvLog.single.errorLog(`get function error: ${CenvLog.colors.errorBold(e as string)}`);
    }
  }
  return false
}

export async function listFunctions(tags = {}, silent = true) {
  try {
    let cmd = new ListFunctionsCommand({MaxItems: 50});
    let res = await getClient().send(cmd);
    if (res) {
      let functions = res.Functions;
      if (!functions) {
        return []
      }
      while (res.NextMarker) {
        cmd = new ListFunctionsCommand({MaxItems: 50, Marker: res.NextMarker})
        res = await getClient().send(cmd);
        if (!res.Functions) {
          return functions;
        }
        functions = functions.concat(res.Functions);
      }
      return functions;
    }
    return [];
  } catch (e) {
    if (!silent) {
      CenvLog.single.errorLog(`list functions error: ${CenvLog.colors.errorBold(e as string)}`);
    }
  }
  return []
}

export async function updateLambdas(environmentVariables: any, functionName: string): Promise<string | false> {

  const functions = await listFunctions(false)
  if (!functions) {
    return false;
  }

  const matchingFunctions: FunctionConfiguration[] = [];
  for (let i = 0; i < functions.length; i++) {
    const func = functions[i];
    if (func.Description?.startsWith(functionName)) {
      matchingFunctions.push(func);
    }
  }

  let resp = ''
  for (let i = 0; i < matchingFunctions.length; i++) {
    const func = matchingFunctions[i];
    resp += await updateConfiguration(func.FunctionName as string, environmentVariables);
  }
  return resp;
}
