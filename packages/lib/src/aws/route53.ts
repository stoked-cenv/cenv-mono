import {
  CreateHostedZoneCommand, DeleteHostedZoneCommand, ListHostedZonesByNameCommand, Route53Client
} from '@aws-sdk/client-route-53';
import {CenvLog} from '../log';

let _client: Route53Client;

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
    if (res && res.HostedZone) {
      CenvLog.info(`hosted zone ${CenvLog.colors.infoBold(res.HostedZone.Name)} created`)
      return res.HostedZone.Id;
    }
    return false;
  } catch (e) {
    CenvLog.single.errorLog(`createHostedZone error: ${CenvLog.colors.errorBold(e as string)}`);
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
    CenvLog.single.errorLog(`createHostedZone error: ${CenvLog.colors.errorBold(e as string)}`);
  }
  return false
}


export async function listHostedZones() {
  try {

    const cmd = new ListHostedZonesByNameCommand({});
    const res = await getClient().send(cmd);
    if (res && res.HostedZones && res.HostedZones.length) {
      return res.HostedZones;
    }
  } catch (e) {
    CenvLog.single.errorLog(`listHostedZone error: ${CenvLog.colors.errorBold(e as string)}`);
  }
  return false
}

export async function hostedZoneExists(Name: string) {
  const hostedZones = await listHostedZones();
  if (!hostedZones) {
    return false;
  }
  for (let i = 0; i < hostedZones.length; i++) {
    const zone = hostedZones[i];
    if (zone.Name === Name + '.') {
      CenvLog.info(`hosted zone ${CenvLog.colors.infoBold(zone.Name)} found`)
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
