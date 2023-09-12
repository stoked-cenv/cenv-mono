import {
  SendMessageCommand,
  SQSClient,
  ReceiveMessageCommand,
} from '@aws-sdk/client-sqs';

import {CenvLog} from '../log';

let _client: SQSClient;

function getClient() {
  if (_client) {
    return _client;
  }
  const {AWS_REGION, AWS_ENDPOINT} = process.env;

  _client = new SQSClient({
    region: AWS_REGION, endpoint: AWS_ENDPOINT
  });
  return _client;
}

interface IMessageAttributes {
  [key: string]: {
    StringValue?: string,
    StringListValues ? : string[]
    DataType: "String" | "StringList"
  }
}

export async function sendMessage({ QueueName, MessageAttributes, MessageGroupId, MessageBody }: {QueueName: string, MessageAttributes: IMessageAttributes, MessageGroupId: string, MessageBody: string}) {
  try {
    const input = {
      // Remove DelaySeconds parameter and value for FIFO queues
      MessageAttributes,
      MessageBody,
      MessageDeduplicationId: Date.now().toString(),  // Required for FIFO queues
      MessageGroupId,  // Required for FIFO queues
      QueueUrl: `https://sqs.${process.env.AWS_REGION}.amazonaws.com/${process.env.CDK_DEFAULT_ACCOUNT}/${QueueName}`
    };

    const cmd = new SendMessageCommand(input);
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

var params = {
  // Remove DelaySeconds parameter and value for FIFO queues
  DelaySeconds: 10,
  MessageAttributes: {
    "Title": {
      DataType: "String",
      StringValue: "The Whistler"
    },
    "Author": {
      DataType: "String",
      StringValue: "John Grisham"
    },
    "WeeksOn": {
      DataType: "Number",
      StringValue: "6"
    }
  },
  MessageBody: "Information about current NY Times fiction bestseller for week of 12/11/2016.",
  // MessageDeduplicationId: "TheWhistler",  // Required for FIFO queues
  // MessageGroupId: "Group1",  // Required for FIFO queues
  QueueUrl: "SQS_QUEUE_URL"
};

sqs.sendMessage(params, function(err, data) {
  if (err) {
    console.log("Error", err);
  } else {
    console.log("Success", data.MessageId);
  }
});