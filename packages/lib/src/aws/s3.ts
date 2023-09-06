import {_Object, GetObjectCommand, ListBucketsCommand, ListObjectsCommand, PutObjectCommand, S3Client} from '@aws-sdk/client-s3';
import { S3SyncClient } from 's3-sync-client';
import {CenvLog} from '../log';
import {Cenv} from "../cenv";
import {SyncCommandOutput, SyncOptions} from "s3-sync-client/dist/commands/SyncCommand";
import { TransferMonitor } from 's3-sync-client';
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import {SdkStreamMixin} from "@smithy/types";
import { humanFileSize } from '../utils';


let _client: S3Client;
let _sync: (source: string, target: string, options?: SyncOptions) => Promise<SyncCommandOutput>;

export interface BucketObject  {
  key: string,
  size: number,
  fileSize: string,
  date: Date,
  url?: string
}
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
    return await sync(path, `s3://${bucketName}`, { del: true, partSize: 100 * 1024 * 1024, monitor }); // uses multipart uploads for files higher than 100MB
  } catch (e) {
    CenvLog.single.errorLog(`failed to get vpc id: ${CenvLog.colors.errorBold(e as string)}`);
    Cenv.dashboard.debug(CenvLog.colors.errorBold(e as string))
  }
  return false
}

export async function getPresignedUrl({region, bucket, key}: { region: string, bucket: string, key: string }) {
  const createPresignedUrlWithClient =  ({bucket, key}: { region: string, bucket: string, key: string }) => {
    const client = new S3Client({region});
    const command = new GetObjectCommand({Bucket: bucket, Key: key});
    return getSignedUrl(client, command, {expiresIn: 60000});
  };
  return await createPresignedUrlWithClient({region, bucket, key});
}

export async function listObjects({region, bucket}: { region: string, bucket: string }): Promise<BucketObject[] | false> {
  const client = new S3Client({region});
  const {Contents} = await client.send(new ListObjectsCommand({Bucket: bucket}));
  if (Contents) {
    return Contents
    .filter((obj) => obj && obj.Key && obj.Size && obj.LastModified)
    .map((o) => {
      return {key: o.Key, size: o.Size, fileSize: humanFileSize(o.Size!, true, 1), date: o.LastModified} as BucketObject;
    })
    .sort((a, b) => {
      if (b.size < a.size) {
        return -1;
      } else if (b.size > a.size) {
        return 1;
      }
      return 0;
    });
  }
  return false;
}

export async function listBuckets({region}: { region: string }): Promise<{
  date: Date;
  name: string
}[] | false> {
  const client = new S3Client({region});
  const {Buckets} = await client.send(new ListBucketsCommand({Region: region}));
  if (Buckets) {
    return Buckets
    .filter(bucket => bucket.Name && bucket.CreationDate)
    .map((bucket) => {
      return {
        name: bucket.Name!, date: bucket.CreationDate!
      };
    });

  }
  return false;
}

export async function getObject({region, bucket, key}: { region: string, bucket: string, key: string }): Promise<(ReadableStream & SdkStreamMixin) | false> {
  try {
    const client = new S3Client({region});
    const {Body} = await client.send(new GetObjectCommand({Bucket: bucket, Key: key}));
    if (Body) {
      return Body;
    }
  } catch (e) {
    CenvLog.single.catchLog(e);
  }
  return false;
}

export async function putObject({region, bucket, key, body}: { region: string, bucket: string, key: string, body: string }): Promise<boolean> {
  try {
    const client = new S3Client({region});
    await client.send(new PutObjectCommand({Bucket: bucket, Key: key, Body: body}));
    return true;
  } catch (e) {
    CenvLog.single.catchLog(e);
  }
  return false;
}
