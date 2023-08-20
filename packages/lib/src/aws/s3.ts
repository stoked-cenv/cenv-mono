import {S3Client} from '@aws-sdk/client-s3';
import { S3SyncClient } from 's3-sync-client';
import {CenvLog} from '../log';
import {Cenv} from "../cenv";
import {SyncCommandOutput, SyncOptions} from "s3-sync-client/dist/commands/SyncCommand";
import { TransferMonitor } from 's3-sync-client';

let _client: S3Client;
let _sync: (source: string, target: string, options?: SyncOptions) => Promise<SyncCommandOutput>;

function getClient() {
  if (_client) {
    return _client;
  }
  const {AWS_REGION, AWS_ENDPOINT} = process.env;

  _client = new S3Client({
                            region: AWS_REGION, endpoint: AWS_ENDPOINT
                          });
  return _client;
}

function getSync() {
  if (_sync) {
    return _sync;
  }

  const { sync } = new S3SyncClient({ client: getClient() });
  _sync = sync;
  return _sync;
}

export async function s3sync(path: string, bucketName: string) {
  try {

    const monitor = new TransferMonitor();
    monitor.on('progress', (progress) => console.log(progress));

    const sync = getSync();
    return await sync(path, `s3://${bucketName}`, { partSize: 100 * 1024 * 1024, monitor }); // uses multipart uploads for files higher than 100MB
  } catch (e) {
    CenvLog.single.errorLog(`failed to get vpc id: ${CenvLog.colors.errorBold(e as string)}`);
    Cenv.dashboard.debug(CenvLog.colors.errorBold(e as string))
  }
  return false
}
