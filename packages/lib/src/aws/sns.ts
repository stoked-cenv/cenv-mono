import {
  SNSClient,
  GetTopicAttributesCommand,
  SubscribeCommand,
  ListTopicsCommand, CreateTopicCommand,
} from '@aws-sdk/client-sns';

import { CenvLog, errorBold } from '../log';


let _client: SNSClient = null;

function getClient() {
  if (_client) {
    return _client;
  }
  const { AWS_REGION, AWS_ENDPOINT } = process.env;

  _client = new SNSClient({
    region: AWS_REGION,
    endpoint: AWS_ENDPOINT
  });
  return _client;
}

async function getTopicAttributes(topicArn: string) {
  try {
    const cmd = new GetTopicAttributesCommand({
      TopicArn: topicArn,
    })
    const res = await getClient().send(cmd);
    return res;
  } catch (e) {
    CenvLog.single.errorLog(`failed to get topic attributes: ${errorBold(e.message)}`)
    return false;
  }
}

async function listTopics() {
  try {
    const cmd = new ListTopicsCommand({});
    const res = await getClient().send(cmd);
    return res;
  } catch (e) {
    CenvLog.single.errorLog(`failed to list topics: ${errorBold(e.message)}`);
    return false;
  }
}

export async function getTopicArn(topicName: string) {
  const res = await listTopics();
  if (res && res.Topics) {
    for (let i = 0; i < res.Topics.length; i += 1) {
      const topic = res.Topics[i];
      if(topic.TopicArn.indexOf(topicName) > -1) {
        return topic.TopicArn;
      }
    }
  }
  return null;
}

export async function createTopic(DisplayName: string, Name: string, Policy: any) {
  try {
    const cmd = new CreateTopicCommand({
      Name,
      Attributes: {DisplayName, Policy}
    });
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
  } catch (e) {
    CenvLog.single.errorLog(`createTopic error: ${errorBold(e.message)}`);
  }
  return false
}

export async function subscribe(TopicArn: string, Protocol: string, Endpoint: string) {
  try {
    const cmd = new SubscribeCommand({
      TopicArn,
      Protocol,
      Endpoint
    });
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
  } catch (e) {
    CenvLog.single.errorLog(`subscript to topic error: ${errorBold(e.message)}`);
  }
  return false
}
