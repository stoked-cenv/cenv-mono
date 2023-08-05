import {
  AddUserToGroupCommand,
  AttachGroupPolicyCommand,
  AttachRolePolicyCommand,
  CreateGroupCommand,
  CreatePolicyCommand,
  CreateRoleCommand,
  DeleteGroupCommand,
  DeletePolicyCommand,
  DeletePolicyVersionCommand,
  DeleteRoleCommand,
  DetachGroupPolicyCommand,
  DetachRolePolicyCommand,
  GetGroupCommand,
  GetPolicyCommand,
  GetRoleCommand,
  IAMClient,
  ListAttachedGroupPoliciesCommand,
  ListGroupsCommand,
  ListPolicyVersionsCommand,
  RemoveUserFromGroupCommand, Role,
  User,
} from '@aws-sdk/client-iam';
import {CenvLog} from '../log';

let _client: IAMClient;

function getClient() {
  if (_client) {
    return _client;
  }
  const {AWS_REGION, AWS_ENDPOINT} = process.env;

  _client = new IAMClient({
                            region: AWS_REGION, endpoint: AWS_ENDPOINT
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
    if (!silent && e instanceof Error) {
      CenvLog.single.errorLog(`get policy error: ${CenvLog.colors.errorBold(e.message)}`);
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
    if (e instanceof Error) {
      CenvLog.single.errorLog(`create policy error: ${CenvLog.colors.errorBold(e.message)}, ${e}`);
    }
  }
  return false
}

export async function deletePolicy(PolicyArn: string) {
  try {
    const listPolicyVersionsCmd = new ListPolicyVersionsCommand({PolicyArn});
    const listPolicyVersionsRes = await getClient().send(listPolicyVersionsCmd);
    if (listPolicyVersionsRes.Versions === undefined) {
      return false
    }
    for (let i = 0; i < listPolicyVersionsRes.Versions.length; i++) {
      const version = listPolicyVersionsRes.Versions[i];
      if (!version.IsDefaultVersion) {
        const deleteCmd = new DeletePolicyVersionCommand({PolicyArn, VersionId: version.VersionId})
        const deleteRes = await getClient().send(deleteCmd);
      }
    }
    const cmd = new DeletePolicyCommand({PolicyArn});
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
  } catch (e) {
    if (e instanceof Error) {
      CenvLog.single.errorLog(`delete policy [${PolicyArn}] error: ${CenvLog.colors.errorBold(e.message)}`);
    }
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
    if (e instanceof Error) {
      CenvLog.single.errorLog(`attach policy to role error: ${CenvLog.colors.errorBold(e.message)}`);
    }
  }
  return false
}

export async function attachPolicyToGroup(GroupName: string, PolicyName: string, PolicyArn: string) {
  try {
    const listGroupPolicyCmd = new ListAttachedGroupPoliciesCommand({GroupName});
    const listGroupPolicyRes = await getClient().send(listGroupPolicyCmd);
    if (listGroupPolicyRes.AttachedPolicies === undefined) {
      return;
    }
    for (let i = 0; i < listGroupPolicyRes.AttachedPolicies.length; i++) {
      const policy = listGroupPolicyRes.AttachedPolicies[i];
      if (policy.PolicyName === PolicyName) {
        CenvLog.info(`policy ${PolicyName} is already attached to ${GroupName}`);
        return;
      }
    }

    const cmd = new AttachGroupPolicyCommand({GroupName, PolicyArn})
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
  } catch (e) {
    if (e instanceof Error) {
      CenvLog.single.errorLog(`attach policy to group error: ${CenvLog.colors.errorBold(e.message)}`);
    }
  }
}

export async function deleteGroup(GroupName: string, silent = true) {
  try {
    const listGroupsCmd = new ListGroupsCommand({});
    const listGroupsRes = await getClient().send(listGroupsCmd);
    if (listGroupsRes.Groups === undefined) {
      return false;
    }
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
    if (getRes.Users === undefined) {
      return false;
    }
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
      if (!silent && e instanceof Error) {
        CenvLog.single.errorLog(`detach policy error: ${CenvLog.colors.errorBold(e.message)}`)
      }
    }
    const cmd = new DeleteGroupCommand({GroupName});
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
    return false;

  } catch (e) {
    if (!silent && e instanceof Error) {
      CenvLog.single.errorLog(`delete group error: ${CenvLog.colors.errorBold(e.message)}`);
    }
  }
  return false
}

export async function createGroup(GroupName: string) {
  try {
    const listGroupsCmd = new ListGroupsCommand({});
    const listGroupsRes = await getClient().send(listGroupsCmd);
    if (listGroupsRes.Groups === undefined) {
      return false;
    }
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
    if (e instanceof Error) {
      CenvLog.single.errorLog(`create group error: ${CenvLog.colors.errorBold(e.message)}`);
    }
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
  } catch (e) {
    if (e instanceof Error) {
      CenvLog.single.errorLog(`attach user to group error: ${CenvLog.colors.errorBold(e.message)}`);
    }
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
    if (e instanceof Error) {
      CenvLog.single.errorLog(`detatch policy to role error: ${CenvLog.colors.errorBold(e.message)}`);
    }
  }
  return false
}

export async function createRole(RoleName: string, AssumeRolePolicyDocument: any): Promise<false | Role> {
  try {
    const cmd = new CreateRoleCommand({RoleName, AssumeRolePolicyDocument});
    const res = await getClient().send(cmd);
    if (res && res.Role) {
      return res.Role;
    }
    return false;
  } catch (e) {
    if (e instanceof Error) {
      CenvLog.single.errorLog(`create role error: ${CenvLog.colors.errorBold(e.message)}`);
    }
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
    if (e instanceof Error) {
      CenvLog.single.errorLog(`delete role error: ${CenvLog.colors.errorBold(e.message)}`);
    }
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
    if (!silent && e instanceof Error) {
      CenvLog.single.errorLog(`get role error: ${CenvLog.colors.errorBold(e.message)}`);
    }
  }
  return false
}
