import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { GitHubOidcStack } from '../src/oidc-stack';

function trustedSubjects(subClaimPrefix?: string): unknown {
  const app = new cdk.App();
  const stack = new GitHubOidcStack(app, 'oidc', {
    githubRepo: 't-j-c/chip-tracker',
    subClaimPrefix,
    env: { account: '123456789012', region: 'us-east-1' },
  });
  const roles = Template.fromStack(stack).findResources('AWS::IAM::Role', {
    Properties: { RoleName: 'chip-tracker-github-deploy' },
  });
  const role = Object.values(roles)[0] as any;
  return role.Properties.AssumeRolePolicyDocument.Statement[0].Condition.StringLike[
    'token.actions.githubusercontent.com:sub'
  ];
}

describe('GitHubOidcStack', () => {
  test('defaults to the legacy repo subject format', () => {
    expect(trustedSubjects()).toEqual([
      'repo:t-j-c/chip-tracker:ref:refs/heads/main',
      'repo:t-j-c/chip-tracker:pull_request',
      'repo:t-j-c/chip-tracker:environment:production',
    ]);
  });

  test('uses the immutable subject prefix when provided', () => {
    const prefix = 'repo:t-j-c@16748068/chip-tracker@1310325399';
    expect(trustedSubjects(prefix)).toEqual([
      `${prefix}:ref:refs/heads/main`,
      `${prefix}:pull_request`,
      `${prefix}:environment:production`,
    ]);
  });
});
