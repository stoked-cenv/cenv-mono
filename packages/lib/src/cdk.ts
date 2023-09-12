import {Package, ProcessMode} from "./package";
import {CenvLog, cleanTags} from "./log";
import {Cenv} from "./cenv";
import {printColumns} from "./types";
import {ProfileData} from "./stdio";
import chalk from "chalk";

function isCdkInProgress(status: string) {
  return ['CREATE_IN_PROGRESS', 'CREATE_IN_PROGRESS', 'IMPORT_IN_PROGRESS', 'IMPORT_ROLLBACK_IN_PROGRESS', 'ROLLBACK_IN_PROGRESS', 'UPDATE_IN_PROGRESS', 'UPDATE_ROLLBACK_IN_PROGRESS' ].includes(status);
}

export interface CdkResource {
  logicalId: string,
  type: string,
  status: string,
  time: string,
  reason: string,
  step: string
}

export interface CdkResources {
  [constructId: string]: CdkResource
}

export interface CdkProcess {
  processId: string;
  type: string;
  status: string;
  stack: string;
  start: string;
  end?: string;
  resources: CdkResources;
  render?: () => void;
  updated: boolean;
}


function getResourceStatusGroup(status: string) {
  let group;
  switch(status) {
    case "CREATE_COMPLETE":
    case "DELETE_COMPLETE":
    case "DELETE_SKIPPED":
    case "IMPORT_COMPLETE":
    case "UPDATE_COMPLETE":
    case "IMPORT_ROLLBACK_COMPLETE":
    case "ROLLBACK_COMPLETE":
      group = "success";
      break;
    case "CREATE_FAILED":
    case "DELETE_FAILED":
    case "IMPORT_FAILED":
    case "UPDATE_FAILED":
    case "ROLLBACK_FAILED":
    case "IMPORT_ROLLBACK_FAILED":
    case "UPDATE_ROLLBACK_FAILED":
      group = "error";
      break;
    case "CREATE_IN_PROGRESS":
    case "DELETE_IN_PROGRESS":
    case "IMPORT_IN_PROGRESS":
    case "UPDATE_IN_PROGRESS":
    case "UPDATE_ROLLBACK_IN_PROGRESS":
    case "IMPORT_ROLLBACK_IN_PROGRESS":
      group = "progress";
      break;
  }
  return group;
}

function getResourceStatusColors(data: CdkResource): {valueColor: chalk.Chalk, keyColor: chalk.Chalk} {
  const group = getResourceStatusGroup(data.status);
  if (group === "success") {
    return {valueColor: CenvLog.colors.success, keyColor: CenvLog.colors.successDim};
  } else if (group === "error") {
    return {valueColor: CenvLog.colors.alert, keyColor: CenvLog.colors.alertDim};
  } else if (group === "progress") {
    return {valueColor: CenvLog.colors.smooth, keyColor: CenvLog.colors.smoothDim};
  }
  return {valueColor: CenvLog.colors.warning, keyColor: CenvLog.colors.warningDim};
}

export function cdkout(options: any, chunk: string, output: string, pkg?: Package) {
  // match cdk status output
  if (options?.cdkSupported && pkg) {
    // (.*?) \| {1,3}([ 0-9]+) \| ([0-9]{1,2}\:[0-9]{2}\:[0-9]{2} (AM|PM)) \| ([A-Z_\_]*) *\| ([a-z_A-Z_\:0-9]*) *\| ([0-9-a-z_A-Z_\:\/-]*) ([A-Z_a-z ]*)?(\((.*)\))? ?(.*)?$

    const uniqueId = options.pkgCmd.uniqueId;
    const cdkRegExp = /(.*?) \| {1,3}([ 0-9]+) \| ([0-9]{1,2}\:[0-9]{2}\:[0-9]{2} (AM|PM)) \| ([A-Z_\_]*) *\| ([a-z_A-Z_\:0-9]*) *\| ([0-9-a-z_A-Z_\:\/-]*) (\((.*)\))? ?(.*)?$/gm;
    const componentParts = ['stack', 'step', 'time', 'am-pm', 'status', 'resourceType', 'logicalResourceId', 'constructId', 'delete-me', 'reason'];
    let m;

    let updated = false;
    while ((m = cdkRegExp.exec(cleanTags(chunk))) !== null) {
      // This is necessary to avoid infinite loops with zero-width matches
      if (m.index === cdkRegExp.lastIndex) {
        cdkRegExp.lastIndex++;
      }
      updated = true;
      // The result can be accessed through the `m`-variable.
      const components: any = {};
      m.forEach((match, groupIndex) => {
        if (groupIndex - 1 >= 0) {
          components[componentParts[groupIndex - 1]] = match;
        }
      });
      /*console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@')
      console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@')
      console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@')
      console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@')
      console.log(JSON.stringify(components, null, 2));
      console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@')
      console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@')
      console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@')
      console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@')

       */
      delete components['am-pm'];
      delete components['delete-me'];
      components.region = 'us-east-1';
      let cdkProcess = pkg.cdkProcesses[uniqueId];
      let newProcess = false;
      if (!cdkProcess) {
        pkg.cdkProcesses[uniqueId] = {
          processId: uniqueId,
          type: options?.cdkSupported,
          start: components.time,
          stack: components.stack,
          status: components.status,
          resources: {},
          updated: true
        }
        newProcess = true;
        cdkProcess = pkg.cdkProcesses[uniqueId];
      } else {
        cdkProcess.end = components.time;
        cdkProcess.updated = true;
      }
      if (!newProcess) {
        const resource = cdkProcess.resources[components.constructId];
        if (!resource) {
          cdkProcess.resources[components.constructId] = {
            logicalId: components.logicalResourceId,
            type: components.resourceType,
            status: components.status,
            time: components.time,
            reason: components.reason,
            step: components.step
          }
        } else {
          resource.status = components.status;
          resource.time = components.time;
          resource.reason = components.reason;
        }
      }
    }
    if (pkg.cdkProcesses[uniqueId].updated && pkg.cdkProcesses[uniqueId].resources && pkg.cdkProcesses[uniqueId].resources.length) {
      const rows = printColumns(Object.values(pkg.cdkProcesses[uniqueId].resources), getResourceStatusColors, ['step', 'logicalId', 'type', 'status', 'time', 'reason']);
      for (const cmd of pkg.cmds) {
        if (cmd.uniqueId !== uniqueId) {
          cmd.stdout = rows;
        }
      }
      pkg.cdkProcesses[uniqueId].updated = false;
    }
  }
}