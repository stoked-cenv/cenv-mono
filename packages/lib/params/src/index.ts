import { CenvParams } from '@stoked-cenv/cenv-lib';

exports.handler = async function(event, context, callback) {
  try {
    const output = await CenvParams.MaterializeCore(event, context);
    callback(null, output);
  } catch (err) {
    console.log('error:\n', JSON.stringify(err, null, 2));
    callback(err);
  }
};
