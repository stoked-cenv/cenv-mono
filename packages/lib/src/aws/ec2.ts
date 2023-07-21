import {DescribeVpcsCommand, EC2Client} from '@aws-sdk/client-ec2';
import {CenvLog, errorBold} from '../log';
import {Cenv} from "../cenv";

let _client: EC2Client = null;

function getClient() {
  if (_client) {
    return _client;
  }
  const {AWS_REGION, AWS_ENDPOINT} = process.env;

  _client = new EC2Client({
                            region: AWS_REGION, endpoint: AWS_ENDPOINT
                          });
  return _client;
}

export async function getVpcId(name: string) {
  try {
    const input = { // DescribeVpcsRequest
      Filters: [ // FilterList
        { // Filter
          Name: "tag:Name", Values: [ // ValueStringList
            name,],
        },], MaxResults: 5,
    };
    Cenv.dashboard.debug('vpcId filter: ' + input);
    const cmd = new DescribeVpcsCommand(input);
    const res = await getClient().send(cmd);
    Cenv.dashboard.debug('getVpcId res: ' + JSON.stringify(res, null, 2));
    if (res && res.Vpcs?.length) {

      return res.Vpcs[0].VpcId;
    }
    CenvLog.single.errorLog(`failed to get vpc name: ${errorBold(name)}`);
  } catch (e) {
    CenvLog.single.errorLog(`failed to get vpc id: ${errorBold(e.message)}`);
    Cenv.dashboard.debug(errorBold(e.message))
  }
  return false
}
