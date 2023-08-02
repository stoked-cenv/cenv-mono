import {
  CreateTopicCommand, GetTopicAttributesCommand, ListTopicsCommand, SNSClient, SubscribeCommand,
} from '@aws-sdk/client-sns';

import {CenvLog, colors} from '../log';


let _client: SNSClient;

function getClient() {
  if (_client) {
    return _client;
  }
  const {AWS_REGION, AWS_ENDPOINT} = process.env;

  _client = new SNSClient({
                            region: AWS_REGION, endpoint: AWS_ENDPOINT
                          });
  return _client;
}

async function getTopicAttributes(topicArn: string) {
  try {
    const cmd = new GetTopicAttributesCommand({
                                                TopicArn: topicArn,
                                              })
    return await getClient().send(cmd);
  } catch (e) {
    CenvLog.single.errorLog(`failed to get topic attributes: ${colors.errorBold(e as string)}`)
    return false;
  }
}

async function listTopics() {
  try {
    const cmd = new ListTopicsCommand({});
    return await getClient().send(cmd);
  } catch (e) {
    CenvLog.single.errorLog(`failed to list topics: ${colors.errorBold(e as string)}`);
    return false;
  }
}

export async function getTopicArn(topicName: string) {
  const res = await listTopics();
  if (res && res.Topics) {
    for (let i = 0; i < res.Topics.length; i += 1) {
      const topic = res.Topics[i];
      if (topic.TopicArn && topic.TopicArn.indexOf(topicName) > -1) {
        return topic.TopicArn;
      }
    }
  }
  return null;
}

export async function createTopic(DisplayName: string, Name: string, Policy: any) {
  try {
    const cmd = new CreateTopicCommand({
                                         Name, Attributes: {DisplayName, Policy}
                                       });
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
  } catch (e) {
    CenvLog.single.errorLog(`createTopic error: ${colors.errorBold(e as string)}`);
  }
  return false
}

export async function subscribe(TopicArn: string, Protocol: string, Endpoint: string) {
  try {
    const cmd = new SubscribeCommand({
                                       TopicArn, Protocol, Endpoint
                                     });
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
  } catch (e) {
    CenvLog.single.errorLog(`subscript to topic error: ${colors.errorBold(e as string)}`);
  }
  return false
}
