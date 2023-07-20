import {
  CloudFormationClient,
  ListStacksCommand,
  DescribeStacksCommand,
  ListExportsCommand,
  CancelUpdateStackCommand,
  DeleteStackCommand,
  waitUntilStackDeleteComplete,

} from '@aws-sdk/client-cloudformation';

import { CenvLog, errorBold } from '../log';
import {Package} from "../package/package";
import {checkExceptions, WaiterConfiguration, WaiterState} from '@aws-sdk/util-waiter'
import {WaiterResult} from "@aws-sdk/util-waiter/dist-types/waiter";

let _client: CloudFormationClient = null;

function getClient() {
  if (_client) {
    return _client;
  }
  const { AWS_REGION, AWS_ENDPOINT } = process.env;

  _client = new CloudFormationClient({
    region: AWS_REGION,
    endpoint: AWS_ENDPOINT
  });
  return _client;
}

const aliasName = 'alias/curb-key';
export async function listStacks(StackStatusFilter: string[]) {
  try {
    let cmd = new ListStacksCommand({StackStatusFilter: StackStatusFilter});
    let res = await getClient().send(cmd);
    let stacks = res.StackSummaries;
    while (res.NextToken) {
      cmd = new ListStacksCommand({ NextToken: res.NextToken });
      res = await getClient().send(cmd);
      stacks = stacks.concat(res.StackSummaries);
    }
    return stacks;
  } catch (e) {
    CenvLog.single.errorLog(`list stacks failed: ${errorBold(e.message)}, ${e}`)
  }
}

export async function describeStacks(stackName: string, silent = false) {
  try {
    let cmd = new DescribeStacksCommand({StackName: stackName});
    let res = await getClient().send(cmd);
    let stacks = res.Stacks;
    while (res.NextToken) {
      cmd = new DescribeStacksCommand({ NextToken: res.NextToken });
      res = await getClient().send(cmd);
      stacks = stacks.concat(res.Stacks);
    }
    return stacks;
  } catch (e) {
    if (!silent) {
      CenvLog.single.errorLog(`describe stacks failed: ${errorBold(e.message)}, ${e}`);
    }
  }
}

export async function listExports() {
  try {
    let cmd = new ListExportsCommand({});
    let res = await getClient().send(cmd);
    let exports = res.Exports;
    while (res.NextToken) {
      cmd = new ListExportsCommand({ NextToken: res.NextToken });
      res = await getClient().send(cmd);
      exports = exports.concat(res.Exports);
    }
    return exports;
  } catch (e) {
    CenvLog.single.errorLog(`list exports failed: ${errorBold(e.message)}, ${e}`)
  }
}

export async function deleteStack(StackName: string, waitForIt = true, errorOnFailure = false): Promise<boolean> {
  try {
    const cmd = new DeleteStackCommand({ StackName });
    const res= await getClient().send(cmd);
    if (waitForIt) {
      const waiter = await waitUntilStackDeleteComplete({client: getClient(), maxWaitTime: 2000}, { StackName})
      checkExceptions(waiter);
    }
    return true;
  } catch (e) {
    const errorString = `delete stack ${StackName}: ${errorBold(e.message)}, ${e}`;
    if (!errorOnFailure) {
      CenvLog.single.errorLog(errorString);
      return false
    } else {
      throw new Error(errorString);
    }
  }
}


export async function cancelUpdateStack(StackName: string) {
  try {
    const cmd = new CancelUpdateStackCommand({ StackName });
    const res= await getClient().send(cmd);
    Package.fromStackName(StackName)?.info(JSON.stringify(res.$metadata));
  } catch (e) {
    CenvLog.single.errorLog(`cancel update stack: ${errorBold(e.message)}, ${e}`);
  }
}


export async function getExportValue(exportName: string, silent = false): Promise<string | false> {
  let exports = await listExports();
  if (!exports) {
    return false;
  }

  const updatedExport = exportName.startsWith(`${process.env.ENV}-`) ? exportName : `${process.env.ENV}-${exportName}`;
  exports = exports.filter(e => e.Name === updatedExport);

  if (exports.length) {
    return exports[0].Value;
  }

  if (!silent) {
    const err = new Error(`export not found: ${exportName}`);
    CenvLog.single.errorLog(err.stack);
  }

  return false;

}
