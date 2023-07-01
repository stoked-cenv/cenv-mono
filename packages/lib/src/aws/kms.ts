import {
  KMSClient,
  CreateKeyCommand,
  CreateAliasCommand,
  ListAliasesCommand,
  ListKeysCommand,
  PutKeyPolicyCommand,
  GetKeyPolicyCommand,
  EncryptCommand,
  DecryptCommand,
} from '@aws-sdk/client-kms';

import { colors, CenvLog } from '../log';
import { getAccountId } from './sts';
// import { isArray } from 'aws-cdk/lib/util';


let _client: KMSClient = null;

function getClient() {
  if (_client) {
    return _client;
  }

  const { AWS_REGION, AWS_ENDPOINT } = process.env;

  _client = new KMSClient({
    region: AWS_REGION,
    endpoint: AWS_ENDPOINT
  });
  return _client;
}

const aliasName = 'alias/curb-key';
export async function getKey() {
  const listKeysCommand = new ListKeysCommand({});
  const listKeysRes = await getClient().send(listKeysCommand);
  const listAliasesCmd = new ListAliasesCommand({});
  const listAliasesRes = await getClient().send(listAliasesCmd);
  for (let i = 0; i < listAliasesRes.Aliases.length; i++){
    const alias = listAliasesRes.Aliases[i];
    if (alias.AliasName === aliasName) {

      for (let j = 0; j <listKeysRes.Keys.length; j++) {
        const key = listKeysRes.Keys[j];
        if (key.KeyId === alias.TargetKeyId) {
          return key.KeyArn;
        }
      }
    }
  }
  return false;
}

export async function createKey() {
  try {

    const key = await getKey();
    if (key) {
      return key;
    }
    const callerIdentity = await getAccountId();
    if (!callerIdentity) {
      return;
    }
    const cmd = new CreateKeyCommand({
      MultiRegion: true/*,
      Policy: JSON.stringify(`{
      "Version": "2012-10-17",
      "Statement": [
          {
              "Sid": "Enable IAM User Permissions",
              "Effect": "Allow",
              "Principal": {
                  "AWS": "arn:aws:iam::${callerIdentity.Account}:root"
              },
              "Action": "kms:*",
              "Resource": "*"
          },
          {
              "Sid": "Allow access for Key Administrators",
              "Effect": "Allow",
              "Principal": {
                  "AWS": [
                    "arn:aws:iam::${callerIdentity.Account}:group/key-users",
                    ${callerIdentity.UserArn}
                  ]
              },
              "Action": [
                  "kms:Create*",
                  "kms:Describe*",
                  "kms:Enable*",
                  "kms:List*",
                  "kms:Put*",
                  "kms:Update*",
                  "kms:Revoke*",
                  "kms:Disable*",
                  "kms:Get*",
                  "kms:Delete*",
                  "kms:TagResource",
                  "kms:UntagResource",
                  "kms:ScheduleKeyDeletion",
                  "kms:CancelKeyDeletion",
                  "kms:ReplicateKey",
                  "kms:UpdatePrimaryRegion"
              ],
              "Resource": "*"
          },
          {
              "Sid": "Allow key-users access",
              "Effect": "Allow",
              "Principal": {
                  "AWS": "arn:aws:iam::${callerIdentity.Account}:group/key-users"
              },
              "Action": [
                  "kms:Encrypt",
                  "kms:Decrypt",
                  "kms:ReEncrypt*",
                  "kms:GenerateDataKey*",
                  "kms:DescribeKey"
              ],
              "Resource": "*"
          },
          {
              "Sid": "Allow attachment of persistent resources",
              "Effect": "Allow",
              "Principal": {
                  "AWS": "arn:aws:iam::${callerIdentity.Account}:group/key-users"
              },
              "Action": [
                  "kms:CreateGrant",
                  "kms:ListGrants",
                  "kms:RevokeGrant"
              ],
              "Resource": "*",
              "Condition": {
                  "Bool": {
                      "kms:GrantIsForAWSResource": "true"
                  }
              }
          }
      ]
    }`)*/
    });
    const res = await getClient().send(cmd);
    const aliasCmd = new CreateAliasCommand({TargetKeyId: res.KeyMetadata.KeyId, AliasName: aliasName })
    const aliasRes = await getClient().send(aliasCmd);
    return res.KeyMetadata.KeyId;
  } catch (e) {
    CenvLog.single.errorLog(`failed to create key: ${colors.errorBold(e.message)}, ${e}`)
    return false;
  }
}

export async function addKeyAccount(Account: string) {
  try {
    const key = await getKey();
    if (!key) {
      CenvLog.single.alertLog(`the curb-key has not been created on this account`);
      return;
    }

    const getKeyPolicy = new GetKeyPolicyCommand({ KeyId: key, PolicyName: 'default'})
    const getKeyRes = await getClient().send(getKeyPolicy);
    const keyAccount = `arn:aws:iam::${Account}:root`;
    let Policy = JSON.parse(getKeyRes.Policy);
    if (Policy.Statement.length === 1) {
      Policy.Statement.push({
        "Sid" : "Enable other accounts",
        "Effect" : "Allow",
        "Principal" : {
          "AWS" : [keyAccount]
        },
        "Action" : [ "kms:Encrypt*", "kms:GenerateDataKey*", "kms:Decrypt*", "kms:DescribeKey*", "kms:ReEncrypt*" ],
        "Resource" : "*"
      })
    } else if (!Array.isArray(Policy.Statement[1].Principal.AWS) && keyAccount != Policy.Statement[1].Principal.AWS) {
      Policy.Statement[1].Principal.AWS = [Policy.Statement[1].Principal.AWS, keyAccount]
    } else {
      Policy.Statement[1].Principal.AWS.push(keyAccount);
    }
    Policy = JSON.stringify(Policy);

    const putPolicyKeyCmd = new PutKeyPolicyCommand({ KeyId: key, Policy, PolicyName: 'default' });

    return await getClient().send(putPolicyKeyCmd);
  } catch (e) {
    CenvLog.single.errorLog(`failed to add account ${Account} to the curb-key: ${colors.errorBold(e.message)}, ${e}`)
    return false;
  }
}

export async function encrypt(Plaintext: any){
  try {
    if (!process.env.KMS_KEY) {
      CenvLog.single.errorLog(`no KMS_KEY configured run ${colors.errorBold('cenv install -k')} to install a key on this account or ${colors.errorBold('cenv config -k')} to configure a key from another account`);
      return;
    }
    const input = {
      KeyId: process.env.KMS_KEY,
      Plaintext: Buffer.from(JSON.stringify(Plaintext)),
    };
    const cmd = new EncryptCommand(input);
    const encryptedBlob = await getClient().send(cmd);

    const buff = Buffer.from(encryptedBlob.CiphertextBlob);
    return buff.toString('base64');
  } catch (e) {
    CenvLog.single.errorLog(`kms encrypt failed: ${colors.errorBold(e.message)}\n${e}`)
  }
}

export async function decrypt(CiphertextBlob: any) {
  try {
    const cmd = new DecryptCommand({ KeyId: process.env.KeyId, CiphertextBlob: Uint8Array.from(atob(CiphertextBlob), (v) => v.charCodeAt(0)), });
    const decryptedBinaryData = await getClient().send(cmd);
    const decryptedData = String.fromCharCode.apply(null, new Uint16Array(decryptedBinaryData.Plaintext));
    return decryptedData.replace(/['"]+/g, '');
  }catch (e) {
    CenvLog.single.errorLog(`kms decrypt failed: ${colors.errorBold(e.message)}\n${e}`)
  }
}
