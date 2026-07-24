import * as cdk from 'aws-cdk-lib';
import * as dotenv from 'dotenv';
import { ChipTrackerStack } from './stack';

// Load environment variables
dotenv.config();

const app = new cdk.App();

// Get environment from context or env variable
const environment = (
  app.node.tryGetContext('env') ||
  process.env.CDK_ENV ||
  'dev'
) as 'dev' | 'prod';

const projectName = 'chip-tracker';
const stackName = `${projectName}-${environment}`;

// Get AWS region and account
const region = process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || 'us-east-1';
const account = process.env.AWS_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT;

const env: cdk.Environment = {
  region,
  account,
};

// Create stack
new ChipTrackerStack(app, stackName, {
  projectName,
  environment,
  env,
  description: `Chip Tracker infrastructure for ${environment} environment`,
});

app.synth();
