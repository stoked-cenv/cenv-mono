import {CloudFrontToS3} from '@aws-solutions-constructs/aws-cloudfront-s3';
import {validateEnvVars} from "@stoked-cenv/lib";
import * as cdk from "aws-cdk-lib";
/*
import * as kms from "aws-cdk-lib/aws-kms";
import {RemovalPolicy} from "aws-cdk-lib/core";
import {LifecycleRule} from "aws-cdk-lib/aws-s3/lib/rule";
import * as iam from "aws-cdk-lib/aws-iam";
import {
  BlockPublicAccess,
  BucketAccessControl,
  BucketEncryption, BucketMetrics, BucketProps, CorsRule, IBucket, Inventory, ObjectOwnership,
  RedirectTarget,
  RoutingRule
} from "aws-cdk-lib/aws-s3/lib/bucket";
 */

const {ENV, CENV_STACK_NAME} = process.env;

const envVars = validateEnvVars(['ENV', 'CENV_STACK_NAME']);


const app = new cdk.App();


// const bucketProps: BucketProps = {
//   /**
//    * The kind of server-side encryption to apply to this bucket.
//    *
//    * If you choose KMS, you can specify a KMS key via `encryptionKey`. If
//    * encryption key is not specified, a key will automatically be created.
//    *
//    * @default - `Kms` if `encryptionKey` is specified, or `Unencrypted` otherwise.
//    */
//   encryption: BucketEncryption;
//   /**
//    * External KMS key to use for bucket encryption.
//    *
//    * The 'encryption' property must be either not specified or set to "Kms".
//    * An error will be emitted if encryption is set to "Unencrypted" or
//    * "Managed".
//    *
//    * @default - If encryption is set to "Kms" and this property is undefined,
//    * a new KMS key will be created and associated with this bucket.
//    */
//   encryptionKey: kms.IKey;
//   /**
//    * Enforces SSL for requests. S3.5 of the AWS Foundational Security Best Practices Regarding S3.
//    * @see https://docs.aws.amazon.com/config/latest/developerguide/s3-bucket-ssl-requests-only.html
//    *
//    * @default false
//    */
//   enforceSSL?: boolean;
//   /**
//    * Specifies whether Amazon S3 should use an S3 Bucket Key with server-side
//    * encryption using KMS (SSE-KMS) for new objects in the bucket.
//    *
//    * Only relevant, when Encryption is set to {@link BucketEncryption.KMS}
//    *
//    * @default - false
//    */
//   bucketKeyEnabled?: boolean;
//   /**
//    * Physical name of this bucket.
//    *
//    * @default - Assigned by CloudFormation (recommended).
//    */
//   bucketName?: string;
//   /**
//    * Policy to apply when the bucket is removed from this stack.
//    *
//    * @default - The bucket will be orphaned.
//    */
//   removalPolicy?: RemovalPolicy;
//   /**
//    * Whether all objects should be automatically deleted when the bucket is
//    * removed from the stack or when the stack is deleted.
//    *
//    * Requires the `removalPolicy` to be set to `RemovalPolicy.DESTROY`.
//    *
//    * **Warning** if you have deployed a bucket with `autoDeleteObjects: true`,
//    * switching this to `false` in a CDK version *before* `1.126.0` will lead to
//    * all objects in the bucket being deleted. Be sure to update your bucket resources
//    * by deploying with CDK version `1.126.0` or later **before** switching this value to `false`.
//    *
//    * @default false
//    */
//   autoDeleteObjects?: boolean;
//   /**
//    * Whether this bucket should have versioning turned on or not.
//    *
//    * @default false
//    */
//   versioned?: boolean;
//   /**
//    * Whether this bucket should send notifications to Amazon EventBridge or not.
//    *
//    * @default false
//    */
//   eventBridgeEnabled?: boolean;
//   /**
//    * Rules that define how Amazon S3 manages objects during their lifetime.
//    *
//    * @default - No lifecycle rules.
//    */
//   lifecycleRules?: LifecycleRule[];
//   /**
//    * The name of the index document (e.g. "index.html") for the website. Enables static website
//    * hosting for this bucket.
//    *
//    * @default - No index document.
//    */
//   websiteIndexDocument?: string;
//   /**
//    * The name of the error document (e.g. "404.html") for the website.
//    * `websiteIndexDocument` must also be set if this is set.
//    *
//    * @default - No error document.
//    */
//   websiteErrorDocument?: string;
//   /**
//    * Specifies the redirect behavior of all requests to a website endpoint of a bucket.
//    *
//    * If you specify this property, you can't specify "websiteIndexDocument", "websiteErrorDocument" nor , "websiteRoutingRules".
//    *
//    * @default - No redirection.
//    */
//   websiteRedirect?: RedirectTarget;
//   /**
//    * Rules that define when a redirect is applied and the redirect behavior
//    *
//    * @default - No redirection rules.
//    */
//   websiteRoutingRules?: RoutingRule[];
//   /**
//    * Specifies a canned ACL that grants predefined permissions to the bucket.
//    *
//    * @default BucketAccessControl.PRIVATE
//    */
//   accessControl?: BucketAccessControl;
//   /**
//    * Grants public read access to all objects in the bucket.
//    * Similar to calling `bucket.grantPublicAccess()`
//    *
//    * @default false
//    */
//   publicReadAccess?: boolean;
//   /**
//    * The block public access configuration of this bucket.
//    *
//    * @see https://docs.aws.amazon.com/AmazonS3/latest/dev/access-control-block-public-access.html
//    *
//    *
//    * @default - CloudFormation defaults will apply. New buckets and objects don't allow public access, but users can modify bucket policies or object permissions to allow public access
//    */
//   blockPublicAccess?: BlockPublicAccess;
//   /**
//    * The metrics configuration of this bucket.
//    *
//    * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-s3-bucket-metricsconfiguration.html
//    *
//    * @default - No metrics configuration.
//    */
//   metrics?: BucketMetrics[];
//   /**
//    * The CORS configuration of this bucket.
//    *
//    * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-s3-bucket-cors.html
//    *
//    * @default - No CORS configuration.
//    */
//   cors?: CorsRule[];
//   /**
//    * Destination bucket for the server access logs.
//    * @default - If "serverAccessLogsPrefix" undefined - access logs disabled, otherwise - log to current bucket.
//    */
//   serverAccessLogsBucket?: IBucket;
//   /**
//    * Optional log file prefix to use for the bucket's access logs.
//    * If defined without "serverAccessLogsBucket", enables access logs to current bucket with this prefix.
//    * @default - No log file prefix
//    */
//   serverAccessLogsPrefix?: string;
//   /**
//    * The inventory configuration of the bucket.
//    *
//    * @see https://docs.aws.amazon.com/AmazonS3/latest/dev/storage-inventory.html
//    *
//    * @default - No inventory configuration
//    */
//   inventories?: Inventory[];
//   /**
//    * The objectOwnership of the bucket.
//    *
//    * @see https://docs.aws.amazon.com/AmazonS3/latest/dev/about-object-ownership.html
//    *
//    * @default - No ObjectOwnership configuration, uploading account will own the object.
//    *
//    */
//   objectOwnership?: ObjectOwnership;
//   /**
//    * Whether this bucket should have transfer acceleration turned on or not.
//    *
//    * @default false
//    */
//   transferAcceleration?: boolean;
//   /**
//    * The role to be used by the notifications handler
//    *
//    * @default - a new role will be created.
//    */
//   notificationsHandlerRole?: iam.IRole;
//
// }

new CloudFrontToS3(app, `${envVars.ENV}-${envVars.CENV_STACK_NAME}`, {
  bucketProps: {
    publicReadAccess: true, bucketName: `${envVars.ENV}-${envVars.CENV_STACK_NAME}-media`, transferAcceleration: true
  }
});
