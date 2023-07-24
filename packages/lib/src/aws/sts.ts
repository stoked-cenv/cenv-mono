import {GetCallerIdentityCommand, STSClient} from '@aws-sdk/client-sts';
import {CenvLog, errorBold} from '../log';

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
      CenvLog.single.errorLog(`failed to get account id: ${errorBold(e.message)}`);
    }
  }
  return false
}
