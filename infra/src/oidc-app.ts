import * as cdk from 'aws-cdk-lib';
import * as dotenv from 'dotenv';
import { GitHubOidcStack } from './oidc-stack';

// One-time bootstrap: deploy manually with
//   npx cdk deploy --app "npx ts-node src/oidc-app.ts" -c githubRepo=<owner>/chip-tracker
// Not part of the CI/CD pipeline — the pipeline's deploy role is created here.
dotenv.config();

const app = new cdk.App();

const githubRepo = app.node.tryGetContext('githubRepo') || process.env.GITHUB_REPO;
if (!githubRepo) {
  throw new Error('Missing required context "githubRepo" (format: owner/repo). Pass with -c githubRepo=owner/repo');
}

const region = process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || 'us-east-1';
const account = process.env.AWS_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT;

new GitHubOidcStack(app, 'chip-tracker-github-oidc', {
  githubRepo,
  env: { region, account },
  description: 'One-time bootstrap: GitHub Actions OIDC provider + deploy role for Chip Tracker',
});

app.synth();
