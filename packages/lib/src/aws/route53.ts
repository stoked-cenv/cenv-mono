import {
  CreateHostedZoneCommand, DeleteHostedZoneCommand, ListHostedZonesByNameCommand, Route53Client
} from '@aws-sdk/client-route-53';
import {CenvLog, errorBold, infoBold} from '../log';

let _client: Route53Client = null;

function getClient() {
  if (_client) {
    return _client;
  }
  const {AWS_REGION, AWS_ENDPOINT} = process.env;

  _client = new Route53Client({
                                region: AWS_REGION, endpoint: AWS_ENDPOINT
                              });
  return _client;
}

export async function createHostedZone(Name: string) {
  try {

    const cmd = new CreateHostedZoneCommand({Name, CallerReference: Date.now().toString()});
    const res = await getClient().send(cmd);
    if (res) {
      CenvLog.info(`hosted zone ${infoBold(res.HostedZone.Name)} created`)
      return res.HostedZone.Id;
    }
  } catch (e) {
    CenvLog.single.errorLog(`createHostedZone error: ${errorBold(e.message)}`);
  }
  return false
}

export async function deleteHostedZone(Name: string) {
  try {

    const zoneId = await hostedZoneExists(Name);
    if (zoneId) {
      const cmd = new DeleteHostedZoneCommand({Id: zoneId});
      const res = await getClient().send(cmd);
      if (res) {
        return true;
      }
    }
    return true;
  } catch (e) {
    CenvLog.single.errorLog(`createHostedZone error: ${errorBold(e.message)}`);
  }
  return false
}


export async function listHostedZones() {
  try {

    const cmd = new ListHostedZonesByNameCommand({});
    const res = await getClient().send(cmd);
    if (res) {
      return res;
    }
  } catch (e) {
    CenvLog.single.errorLog(`listHostedZone error: ${errorBold(e.message)}`);
  }
  return false
}

export async function hostedZoneExists(Name: string) {
  const listResponse = await listHostedZones();
  if (!listResponse) {
    return false;
  }
  for (let i = 0; i < listResponse.HostedZones.length; i++) {
    const zone = listResponse.HostedZones[i];
    if (zone.Name === Name + '.') {
      CenvLog.info(`hosted zone ${infoBold(zone.Name)} found`)
      return zone.Id;
    }
  }
  return false;
}

export async function ensureHostedZoneExists(Name: string) {
  const zoneExists = await hostedZoneExists(Name);
  if (zoneExists) {
    return zoneExists;
  }
  return await createHostedZone(Name);
}
