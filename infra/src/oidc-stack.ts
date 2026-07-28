import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface GitHubOidcStackProps extends cdk.StackProps {
  /** e.g. "my-org/chip-tracker" */
  githubRepo: string;
}

/**
 * One-time bootstrap stack: creates (or reuses) the GitHub Actions OIDC
 * provider and an IAM role that GitHub Actions can assume via
 * aws-actions/configure-aws-credentials. Deploy this manually, once per
 * account, from a developer machine — it is NOT part of the CI/CD pipeline
 * because the pipeline needs this role to exist before it can run.
 */
export class GitHubOidcStack extends cdk.Stack {
  public readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: GitHubOidcStackProps) {
    super(scope, id, props);

    const { githubRepo } = props;

    const provider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    this.deployRole = new iam.Role(this, 'GitHubDeployRole', {
      roleName: 'chip-tracker-github-deploy',
      description: 'Assumed by GitHub Actions to build/deploy Chip Tracker infrastructure',
      maxSessionDuration: cdk.Duration.hours(1),
      assumedBy: new iam.FederatedPrincipal(
        provider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': [
              `repo:${githubRepo}:ref:refs/heads/main`,
              `repo:${githubRepo}:pull_request`,
              `repo:${githubRepo}:environment:production`,
            ],
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
    });

    // Scope: broad enough to manage this app's stacks via CDK (CloudFormation,
    // ECR, ECS, S3, CloudFront, DynamoDB, IAM PassRole for task roles, logs).
    // Tightening further requires enumerating every resource ARN pattern the
    // stack creates; revisit once the app's resource set stabilizes.
    this.deployRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess')
    );
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['iam:CreateRole', 'iam:DeleteRole', 'iam:AttachRolePolicy', 'iam:DetachRolePolicy',
          'iam:PutRolePolicy', 'iam:DeleteRolePolicy', 'iam:PassRole', 'iam:GetRole', 'iam:TagRole',
          'iam:CreatePolicy', 'iam:DeletePolicy', 'iam:CreatePolicyVersion', 'iam:DeletePolicyVersion'],
        resources: ['*'],
      })
    );

    new cdk.CfnOutput(this, 'DeployRoleArn', {
      value: this.deployRole.roleArn,
      description: 'IAM Role ARN for GitHub Actions to assume (set as AWS_ROLE_TO_ASSUME secret)',
    });
  }
}
