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
    return await getClient().send(cmd);
  } catch (e) {
    if (e instanceof Error) {
      CenvLog.single.errorLog(`failed to get account id: ${CenvLog.colors.errorBold(e.message)}`);
    }
  }
  return false
}
