import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as customResources from 'aws-cdk-lib/custom-resources';
import { getDomains, stackPrefix, tagStack } from '../../index';

export class CognitoIdentityPoolStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    let domains = getDomains();
    let envApp = stackPrefix();

    // Create a pre-token-generation lambda function which adds the 'department: Engineering' claim to user-tokens
    const preTokenLambda =  new lambda.Function(this, `${envApp}PreTokenHandler`, {
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromAsset("lambda"),
      handler: "pre-token-trigger.handler",
    });

    // Create a Cognito UserPool for authentication, attach the lambdaTrigger created above
    const userPool = new cognito.UserPool(this, `${envApp}UserPool`, {
      userPoolName: `${envApp}-UserPool`,
      selfSignUpEnabled: true,
      signInCaseSensitive: true,
      autoVerify: {
        email: true
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: false
        }
      },
      userVerification: {
        emailSubject: "Verify your email",
        emailBody: "Thanks for signing up. Your verification code is {####}",
        emailStyle: cognito.VerificationEmailStyle.CODE
      },
      lambdaTriggers: {
        preTokenGeneration: preTokenLambda
      },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        otp: true,
        sms: false
      }
    })

    // Define a Resource Server for the User Pool
    const betaApplicantScope = new cognito.ResourceServerScope({scopeDescription: "Setup profile and apply for beta access.", scopeName: "beta-applicant"});
    const betaScope = new cognito.ResourceServerScope({scopeDescription: "Approved for beta access.", scopeName: "beta-user"});
    const alphaScope = new cognito.ResourceServerScope({scopeDescription: "Alpha user.", scopeName: "alpha-user"});
    const betaApplicantResourceServer = new cognito.UserPoolResourceServer(this, "betaApplicantResourceServer", {
      userPool: userPool,
      userPoolResourceServerName: "anycompanyAPI",
      identifier: "anycompany",
      scopes: [betaApplicantScope]
    })

    // Create an App client for the User Pool
    // Using localhost for callback + logout for testing purposes
    const userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool: userPool,
      generateSecret: false,
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: true
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
          cognito.OAuthScope.resourceServer(betaApplicantResourceServer, betaApplicantScope)
        ],
        callbackUrls: [process.env.DES_URL_LOGIN_CALLBACK],
        logoutUrls: [process.env.DES_URL_LOGOUT]
      }
    })

    // Get the UNIX timestamp in ms to ensure uniqueness in names
    const timestamp: string = String(new Date().getTime())

    // Create a domain for OAuth2 communication from the application <-> Cognito
    userPool.addDomain("CognitoDomain", { cognitoDomain: { domainPrefix: `${envApp}` }})

    // Create a Cognito Authorizer for the sample API
    //const auth = new apigw.CognitoUserPoolsAuthorizer(this, 'petsAuthorizer', {
    //  cognitoUserPools: [userPool]
    //});


    const authPolicyDocument = new iam.PolicyDocument({
      statements: []
    })

    const cognitoIdentityProviderProperty: cognito.CfnIdentityPool.CognitoIdentityProviderProperty = {
      clientId: userPoolClient.userPoolClientId,
      providerName: userPool.userPoolProviderName,
    };

    // Create the Identity Pool
    const identityPool = new cognito.CfnIdentityPool(this, `${envApp}IdentityPool`, {
      identityPoolName: `${envApp}IdentityPool`,
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [cognitoIdentityProviderProperty]
    })

    const authPolicyProperty: iam.CfnRole.PolicyProperty = {
      policyDocument: authPolicyDocument,
      policyName: `${envApp}AuthRoleAccessPolicy`
    }

    // Create an IAM role for authenticated users, attach ABAC policy to role
    const authRole = new iam.CfnRole(this, `${envApp}CognitoAuthRole`, {
      roleName: `${envApp}-Authorized`,
      assumeRolePolicyDocument: {
        'Statement': [
          {
              'Effect': iam.Effect.ALLOW,
              'Action': ['sts:AssumeRoleWithWebIdentity', 'sts:TagSession'],
              'Condition': {
                  'StringEquals': {
                      'cognito-identity.amazonaws.com:aud': identityPool.ref,
                  },
                  'ForAnyValue:StringLike': {
                      'cognito-identity.amazonaws.com:amr': 'authenticated',
                  },
              },
              'Principal': {
                  'Federated': 'cognito-identity.amazonaws.com'
              }
          }
        ]
      },
      policies: [ authPolicyProperty ]
    })

    new cognito.CfnIdentityPoolRoleAttachment(this, `${envApp}defaultRoles`, {
      identityPoolId: identityPool.ref,
      roles: {
        'authenticated': authRole.attrArn
      }
    })

    const createParameters = {
      "IdentityPoolId": identityPool.ref,
      "IdentityProviderName": userPool.userPoolProviderName,
      "PrincipalTags": {
        "department": "department"
      },
      "UseDefaults": false
    }

    const setPrincipalTagAction = {
      action: "setPrincipalTagAttributeMap",
      service: "CognitoIdentity",
      parameters: createParameters,
      physicalResourceId: customResources.PhysicalResourceId.of(identityPool.ref)
    }

    const { region, account }  = Stack.of(this)
    const identityPoolArn = `arn:aws:cognito-identity:${region}:${account}:identitypool/${identityPool.ref}`

    // Creates a Custom resource (https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.custom_resources-readme.html)
    // This is necessary to attach Principal Tag mappings to the Identity Pool after it has been created.
    // This uses the SDK, rather than CDK code, as attaching Principal Tags through CDK is currently not supported yet
    new customResources.AwsCustomResource(this, `${envApp}CustomPrincipalTags`, {
      onCreate: setPrincipalTagAction,
      onUpdate: setPrincipalTagAction,
      policy: customResources.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [identityPoolArn],
      }),
    })

    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId })
    new CfnOutput(this, 'ClientId', { value: userPoolClient.userPoolClientId })
    new CfnOutput(this, 'IdentityPoolId', { value: identityPool.ref })
    new CfnOutput(this, 'Region', { value: region })

    tagStack(this);
  }
}
