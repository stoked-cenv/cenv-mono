import {
  CreatePolicyCommand,
  CreateRoleCommand,
  DeleteRoleCommand,
  DeletePolicyCommand,
  GetPolicyCommand,
  GetRoleCommand,
  AttachRolePolicyCommand,
  DetachRolePolicyCommand,
  CreateGroupCommand,
  ListGroupsCommand,
  GetGroupCommand,
  IAMClient,
  AttachGroupPolicyCommand,
  ListAttachedGroupPoliciesCommand,
  AddUserToGroupCommand,
  DeleteGroupCommand,
  ListPolicyVersionsCommand,
  DeletePolicyVersionCommand,
  RemoveUserFromGroupCommand, User, DetachGroupPolicyCommand,
} from '@aws-sdk/client-iam';
import { CenvLog, errorBold } from '../log';

let _client: IAMClient = null;

function getClient() {
  if (_client) {
    return _client;
  }
  const { AWS_REGION, AWS_ENDPOINT } = process.env;

  _client = new IAMClient({
    region: AWS_REGION,
    endpoint: AWS_ENDPOINT
  });
  return _client;
}

export async function getPolicy(PolicyArn: string, silent = true) {
  try {
    const cmd = new GetPolicyCommand({PolicyArn});
    const res = await getClient().send(cmd);
    if (res) {
      return res.Policy;
    }
  } catch (e) {
    if (!silent) {
      CenvLog.single.errorLog(`get policy error: ${errorBold(e.message)}`);
    }
  }
  return false
}

export async function createPolicy(PolicyName: string, PolicyDocument: any) {
  try {
    const cmd = new CreatePolicyCommand({PolicyName, PolicyDocument});
    const res = await getClient().send(cmd);
    if (res) {
      return res.Policy;
    }
  } catch (e) {
    CenvLog.single.errorLog(`create policy error: ${errorBold(e.message)}, ${e}`);
  }
  return false
}

export async function deletePolicy(PolicyArn: string) {
  try {
    const listPolicyVersionsCmd = new ListPolicyVersionsCommand({PolicyArn});
    const listPolicyVersionsRes = await getClient().send(listPolicyVersionsCmd);
    for (let i = 0; i < listPolicyVersionsRes.Versions.length; i++) {
      const version = listPolicyVersionsRes.Versions[i];
      if (!version.IsDefaultVersion) {
        const deleteCmd = new DeletePolicyVersionCommand({ PolicyArn, VersionId: version.VersionId })
        const deleteRes = await getClient().send(deleteCmd);
      }
    }
    const cmd = new DeletePolicyCommand({PolicyArn});
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
  } catch (e) {
    CenvLog.single.errorLog(`delete policy [${PolicyArn}] error: ${errorBold(e.message)}`);
  }
  return false
}

export async function attachPolicyToRole(RoleName: string, PolicyArn: string) {
  try {
    const cmd = new AttachRolePolicyCommand({PolicyArn, RoleName});
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
  } catch (e) {
    CenvLog.single.errorLog(`attach policy to role error: ${errorBold(e.message)}`);
  }
  return false
}

export async function attachPolicyToGroup(GroupName: string, PolicyName: string, PolicyArn: string) {
  try {
    const listGroupPolicyCmd = new ListAttachedGroupPoliciesCommand( {GroupName});
    const listGroupPolicyRes = await getClient().send(listGroupPolicyCmd);
    for (let i = 0; i < listGroupPolicyRes.AttachedPolicies.length; i++) {
      const policy = listGroupPolicyRes.AttachedPolicies[i];
      if (policy.PolicyName === PolicyName) {
        CenvLog.info(`policy ${PolicyName} is already attached to ${GroupName}`);
        return;
      }
    }

    const cmd = new AttachGroupPolicyCommand({ GroupName, PolicyArn})
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
  } catch(e) {
    CenvLog.single.errorLog(`attach policy to group error: ${errorBold(e.message)}`);
  }
}

export async function deleteGroup(GroupName: string, silent = true) {
  try {
    const listGroupsCmd = new ListGroupsCommand({});
    const listGroupsRes = await getClient().send(listGroupsCmd);
    let groupExists = false;
    for (let i = 0; i < listGroupsRes.Groups.length; i++) {
      const group = listGroupsRes.Groups[i];
      if (group.GroupName === GroupName) {
        groupExists = true;
        break;
      }
    }

    if (!groupExists) {
      return false;
    }
    const getCmd = new GetGroupCommand({GroupName});
    const getRes = await getClient().send(getCmd);
    for (let i = 0; i < getRes.Users.length; i++) {
      const user: User = getRes.Users[i];
      const rmvCmd = new RemoveUserFromGroupCommand({GroupName, UserName: user.UserName})
      const rmvRes = await getClient().send(rmvCmd);
    }

    try {
      const rmvPolCmd = new DetachGroupPolicyCommand({
        GroupName,
        PolicyArn: `arn:aws:iam::${process.env.CDK_DEFAULT_ACCOUNT}:policy/KmsPolicy`
      });
      const rmvPolRes = await getClient().send(rmvPolCmd);
    } catch (e) {
      if (!silent) {
        CenvLog.single.errorLog(`detach policy error: ${errorBold(e.message)}`)
      }
    }
    const cmd = new DeleteGroupCommand({GroupName});
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
    return false;

  } catch (e) {
    if (!silent) {
      CenvLog.single.errorLog(`delete group error: ${errorBold(e.message)}`);
    }
  }
  return false
}

export async function createGroup(GroupName: string) {
  try {
    const listGroupsCmd = new ListGroupsCommand({});
    const listGroupsRes = await getClient().send(listGroupsCmd);
    for (let i = 0; i < listGroupsRes.Groups.length; i++) {
      const group = listGroupsRes.Groups[i];
      if (group.GroupName === GroupName) {
        CenvLog.info(`group ${GroupName} already exists`);
        return group;
      }
    }
    const cmd = new CreateGroupCommand({GroupName});
    const res = await getClient().send(cmd);
    if (res) {
      CenvLog.info(`group ${GroupName} created`);
      return res.Group;
    }
  } catch (e) {
    CenvLog.single.errorLog(`create group error: ${errorBold(e.message)}`);
  }
  return false
}

export async function addUserToGroup(GroupName: string, UserName: string) {
  try {
    const cmd = new AddUserToGroupCommand({GroupName, UserName})
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
  } catch(e) {
    CenvLog.single.errorLog(`attach user to group error: ${errorBold(e.message)}`);
  }
}

export async function detachPolicyFromRole(RoleName: string, PolicyArn: string) {
  try {
    const cmd = new DetachRolePolicyCommand({PolicyArn, RoleName});
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
  } catch (e) {
    CenvLog.single.errorLog(`detatch policy to role error: ${errorBold(e.message)}`);
  }
  return false
}

export async function createRole(RoleName: string, AssumeRolePolicyDocument: any) {
  try {
    const cmd = new CreateRoleCommand({RoleName, AssumeRolePolicyDocument});
    const res = await getClient().send(cmd);
    if (res) {
      return res.Role;
    }
  } catch (e) {
    CenvLog.single.errorLog(`create role error: ${errorBold(e.message)}`);
  }
  return false
}

export async function deleteRole(RoleName: string) {
  try {

    const cmd = new DeleteRoleCommand({RoleName});
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
  } catch (e) {
    CenvLog.single.errorLog(`delete role error: ${errorBold(e.message)}`);
  }
  return false
}

export async function getRole(RoleName: string, silent = true) {
  try {
    const cmd = new GetRoleCommand({RoleName});
    const res = await getClient().send(cmd);
    if (res) {
      return res.Role;
    }
  } catch (e) {
    if (!silent) {
      CenvLog.single.errorLog(`get role error: ${errorBold(e.message)}`);
    }
  }
  return false
}
