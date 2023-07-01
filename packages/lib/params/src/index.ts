import { CenvParams, LambdaProcessResponse } from '@stoked-cenv/lib';

exports.handler = async function(event: any, context: any, callback: (error: Error, output?: LambdaProcessResponse) => void) {
  try {
    const output: LambdaProcessResponse = await CenvParams.MaterializeCore(event);
    callback(null, output);
  } catch (err) {
    console.log('error:\n', JSON.stringify(err, null, 2));
    callback(err);
  }
};
