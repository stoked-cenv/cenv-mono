import {
  _Object,
  DeleteObjectCommand,
  GetBucketLocationCommand,
  GetObjectCommand,
  GetObjectCommandOutput,
  ListBucketsCommand,
  ListObjectsCommand, ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { S3SyncClient } from 's3-sync-client';
import {CenvLog} from '../log';
import {Cenv} from "../cenv";
import {SyncCommandOutput, SyncOptions} from "s3-sync-client/dist/commands/SyncCommand";
import { TransferMonitor } from 's3-sync-client';
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import {SdkStreamMixin} from "@smithy/types";
import { humanFileSize } from '../utils';
import {writeFileSync} from "fs";



let _sync: (source: string, target: string, options?: SyncOptions) => Promise<SyncCommandOutput>;

export interface BucketObject  {
  key: string,
  size: number,
  fileSize: string,
  date: Date,
  url?: string
}

function getClient() {
  const {
    AWS_REGION,
    AWS_ENDPOINT
  } = process.env;

  return new S3Client({
    region: AWS_REGION,
    endpoint: AWS_ENDPOINT
  });
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

export async function listObjects({region, bucket, maxKeys, continuationToken}: { region: string, bucket: string, maxKeys?: number, continuationToken?: string }): Promise<BucketObject[] | false> {
  console.log('process.env.AWS_PROFILE', process.env.AWS_PROFILE);
  console.log('region', region);
  console.log('bucket', bucket);
  try {
    const client = new S3Client({region});

    const {Contents} = await client.send(new ListObjectsV2Command({Bucket: bucket, MaxKeys: maxKeys, ContinuationToken: continuationToken}));
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
  } catch (e) {
    console.log(e);
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
    })
    .sort((a, b) => {
      if (b.name < a.name) {
        return -1;
      } else if (b.name > a.name) {
        return 1;
      }
      return 0;
    });

  }
  return false;
}


export async function listBucketsWithRegion({region}: { region: string }): Promise<{
  date: Date;
  name: string;
  region: string;
}[] | false> {
  const client = new S3Client({region});
  const Buckets: false | { date: Date; name: string }[] = await listBuckets({region: 'us-east-1'});
  if (Buckets) {
    const res =  Buckets.filter(bucket => bucket.name && bucket.date);

    let buckets = [];
    for (let bucket of res) {
      const region = await getBucketRegion({bucket: bucket.name});
      buckets.push({ ...bucket, region});
    }

    return buckets.sort((a, b) => {
      if (b.name < a.name) {
        return 1;
      } else if (b.name > a.name) {
        return -1;
      }
      return 0;
    });

  }
  return false;
}

export async function getBucketRegion({bucket}: { bucket: string }): Promise<string | false> {
  const { AWS_REGION} = process.env;
  const client = new S3Client({region:AWS_REGION});
  const {LocationConstraint} = await client.send(new GetBucketLocationCommand({Bucket: bucket }));
  if (LocationConstraint) {
    return LocationConstraint;
  }
  return 'us-east-1';
}

export async function getObject({region, bucket, key}: { region: string, bucket: string, key: string }): Promise<GetObjectCommandOutput | false> {
  try {
    const client = new S3Client({region});
    const res = await client.send(new GetObjectCommand({Bucket: bucket, Key: key}));
    if (res && res.Body) {
      return res;
    }
  } catch (e) {
    CenvLog.single.catchLog(e);
  }
  return false;
}

const getBody = (response: GetObjectCommandOutput) => {
  return response.Body && (response.Body as Readable);
};

const getBodyAsBuffer = async (response: GetObjectCommandOutput) => {
  const stream = getBody(response);
  if (stream) {
    const chunks: Buffer[] = [];
    return new Promise<Buffer>((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }
};

const getBodyAsString = async (response: GetObjectCommandOutput) => {
  const buffer = await getBodyAsBuffer(response);
  return buffer?.toString();
};

export async function writeObject({region, bucket, key}: { region: string, bucket: string, key: string }, writePath: string) {
  const res = await getObject({region, bucket, key})
  if (res) {
    let body = await getBodyAsString(res);
    writeFileSync(writePath, body);
  }
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


export async function deleteObject({region, bucket, key}: { region: string, bucket: string, key: string }): Promise<boolean> {
  try {
    const client = new S3Client({region});
    await client.send(new DeleteObjectCommand({Bucket: bucket, Key: key}));
    return true;
  } catch (e) {
    CenvLog.single.catchLog(e);
  }
  return false;
}
