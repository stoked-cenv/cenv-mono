import {
  GetCallerIdentityCommand,
  AssumeRoleCommand,
  STSClient,
  AssumeRoleCommandOutput
} from '@aws-sdk/client-sts';
import {CenvLog} from '../log';
import { createRole, getRole } from './iam';
import { hostname } from 'os';
import { Role } from '@aws-sdk/client-iam';

let _client: STSClient;

function getClient() {
  if (_client) {
    return _client;
  }
  const {AWS_REGION, AWS_ENDPOINT} = process.env;

  _client = new STSClient({
                            region: AWS_REGION, endpoint: AWS_ENDPOINT
                          });
  return _client;
}

export async function getAccountId() {
  try {
    const cmd = new GetCallerIdentityCommand({});
    const res = await getClient().send(cmd);
    if (res && res.Account) {
      return {Account: res.Account, User: res.UserId, UserArn: res.Arn};
    }
  } catch (e) {
    if (e instanceof Error) {
      CenvLog.single.errorLog(`failed to get account id: ${CenvLog.colors.errorBold(e.message)}`);
    }
  }
  return false
}

function getRoleArn(account: string, roleName: string) {
  return `arn:aws:iam::${account}:role/${roleName}`
}

export async function ensureRoleExists(roleName: string, account: string, createFunc: () => Promise<Role | false>, exitIfFail = true) {
  const roleExists = await getRole(roleName);
  if (!roleExists) {
    const existRes =  await createFunc();
    if (!existRes && exitIfFail) {
       CenvLog.single.catchLog(`the role ${roleName} "${getRoleArn(account, roleName)}" could not be created using the current profile: ${process.env.AWS_PROFILE}`);
    }
  }
  return true;
}

export async function ensureGodExists(account: string) {
  const createGod = async () => {
    return await createRole('god', JSON.stringify(
      {
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Principal: {
            AWS: `arn:aws:iam::${account}:root`
          },
          Action: 'sts:AssumeRole',
        }],
      }));
  }
  await ensureRoleExists('god', account, createGod);
}

export async function assumeRole(account: string, roleName: string): Promise<AssumeRoleCommandOutput> {
  const input = {
    'RoleSessionName': `${hostname}_${process.env.USER}-${Date.now().toString()}`,
    'RoleArn': getRoleArn(account, roleName)
  };
  const cmd = new AssumeRoleCommand(input);
  return await getClient().send(cmd);
}

export async function setSession(account: string){
  await ensureGodExists(account);
  return await assumeRole(account, 'god');
}