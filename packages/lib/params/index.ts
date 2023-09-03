import { CenvParams, LambdaProcessResponse } from '@stoked-cenv/lib';

export async function handler(event: any, context: any, callback: (error: Error | unknown, output?: LambdaProcessResponse) => void) {
  try {
    const output: LambdaProcessResponse = await CenvParams.MaterializeCore(event);
    callback(output.error, { before: output.before, after: output.after });
  } catch (err: Error | unknown) {
    console.log('error:\n', JSON.stringify(err, null, 2));
    callback(err);
  }
}
