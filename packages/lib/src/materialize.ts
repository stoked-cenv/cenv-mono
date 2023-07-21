import {CenvParams, LambdaProcessResponse} from './params'

exports.handler = async function (event) {
  try {
    console.log("request:", JSON.stringify(event, null, 2));
    const output: LambdaProcessResponse = await CenvParams.MaterializeCore(event);
    return {
      statusCode: 200, headers: {"Content-Type": "text/plain"}, body: output
    };
  } catch (err) {
    console.log('error:\n', JSON.stringify(err, null, 2));
    return {
      statusCode: 400, headers: {"Content-Type": "text/plain"}, body: err
    };
  }
};