import {
  CreateInvalidationCommand,
  CloudFrontClient,
} from '@aws-sdk/client-cloudfront';

import {CenvLog} from '../log';

let _client: CloudFrontClient;

function getClient() {
  if (_client) {
    return _client;
  }
  const {AWS_REGION, AWS_ENDPOINT} = process.env;

  _client = new CloudFrontClient({
                                       region: AWS_REGION, endpoint: AWS_ENDPOINT
                                     });
  return _client;
}

export async function createInvalidation(DistributionId: string, quantity: 100) {
  try {
    const input = { // CreateInvalidationRequest
      DistributionId,
      InvalidationBatch: {
        Paths: {
          Quantity: Number(100),
          Items: ['/*'],
        },
        CallerReference: Date.now().toString(),
      },
    };

    let cmd = new CreateInvalidationCommand(input);
    const res = await getClient().send(cmd);
    if (!res || !res.Invalidation) {
      return false;
    }
    return res.Invalidation;
  } catch (e) {
    if (e instanceof Error) {
      CenvLog.single.errorLog(`cloudfront invalidationfailed: ${CenvLog.colors.errorBold(e.message)}, ${e}`)
    }
  }
  return false
}
