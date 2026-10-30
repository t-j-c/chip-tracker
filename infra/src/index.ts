import * as cdk from 'aws-cdk-lib';
import { readStackConfig } from './config';
import { ChipTrackerStack } from './stack';

// Production stack. Build the Lambda bundles first (pwsh scripts/publish-lambdas.ps1), then:
//   npx cdk deploy chip-tracker-prod -c alertEmail=you@example.com
const app = new cdk.App();

new ChipTrackerStack(app, 'chip-tracker-prod', {
  ...readStackConfig(app.node),
  // The CloudFront certificate must live in us-east-1, so the whole stack does.
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
  description: 'Chip Tracker (serverless): CloudFront + S3, HTTP API + WebSocket API on Lambda, DynamoDB',
});

app.synth();
