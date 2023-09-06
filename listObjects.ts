import {listObjects} from '@stoked-cenv/lib';
import {parse} from 'path';

async function checkBucketObjects({region, bucket}: { region: string, bucket: string }) {
  const objects = await listObjects({region, bucket});
  if (!objects) {
    return;
  }

  // loop through all the records
  for (const obj of objects) {
    const isMovie = ['.mp4', '.mkv', '.mov'].indexOf(parse(obj.key).ext) > -1;
    const isAbove200MB = obj.size > 200000000;
    if (isMovie && isAbove200MB) {
      console.log(`${obj.key} ${obj.size} ${obj.fileSize} ${obj.date.toLocaleDateString()}`);
    }
  }
}

checkBucketObjects({region: 'us-west-2', bucket: 'stoked-df'});