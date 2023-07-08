import { Stack } from 'aws-cdk-lib';


export function tagStack(stack: Stack) {
  tagIfExists(stack, "CENV_PKG_VERSION");
  tagIfExists(stack, "CENV_PKG_DIGEST");
}

export function tagIfExists(stack: Stack, EnvVar: string) {
  if (process.env[EnvVar]) {
    console.log(`[${process.env.ENV}] stack tag: { ${EnvVar}: ${process.env[EnvVar]!} }`)
    stack.tags.setTag(EnvVar, process.env[EnvVar]!, 1);
  }
}
