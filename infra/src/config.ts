import * as path from 'path';
import { Node } from 'constructs';
import { ThrottleConfig } from './stack';

export interface StackConfig {
  domainName: string;
  hostedZoneId: string;
  hostedZoneName: string;
  alertEmail: string;
  monthlyBudgetUsd: number;
  apiMemoryMb: number;
  httpThrottle: ThrottleConfig;
  wsThrottle: ThrottleConfig;
  apiAssetPath: string;
  wsConnectAssetPath: string;
}

const repoRoot = path.resolve(__dirname, '..', '..');

// Values passed with `-c key=value` arrive as strings; values from cdk.json keep their JSON types.
function parse(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function required(node: Node, key: string, hint: string): string {
  const value = node.tryGetContext(key);
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required CDK context "${key}". ${hint}`);
  }
  return value.trim();
}

function positiveNumber(node: Node, key: string, fallback: number): number {
  const raw = node.tryGetContext(key);
  const value = raw === undefined ? fallback : Number(parse(raw));
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`CDK context "${key}" must be a positive number (got ${JSON.stringify(raw)}).`);
  }
  return value;
}

function throttle(node: Node, key: string, fallback: ThrottleConfig): ThrottleConfig {
  const raw = node.tryGetContext(key);
  if (raw === undefined) return fallback;
  const value = parse(raw) as Partial<ThrottleConfig>;
  const rateLimit = Number(value?.rateLimit);
  const burstLimit = Number(value?.burstLimit);
  if (!(rateLimit > 0) || !(burstLimit > 0)) {
    throw new Error(`CDK context "${key}" must be {"rateLimit": n, "burstLimit": n} (got ${JSON.stringify(raw)}).`);
  }
  return { rateLimit, burstLimit };
}

export function readStackConfig(node: Node): StackConfig {
  const alertEmail = required(node, 'alertEmail',
    'It is not committed (public repo): pass -c alertEmail=you@example.com (CI uses the ALERT_EMAIL variable).');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(alertEmail)) {
    throw new Error(`CDK context "alertEmail" is not a valid email address.`);
  }

  return {
    domainName: required(node, 'domainName', 'Set it in infra/cdk.json.'),
    hostedZoneId: required(node, 'hostedZoneId', 'Set it in infra/cdk.json.'),
    hostedZoneName: required(node, 'hostedZoneName', 'Set it in infra/cdk.json.'),
    alertEmail,
    monthlyBudgetUsd: positiveNumber(node, 'monthlyBudgetUsd', 5),
    apiMemoryMb: positiveNumber(node, 'apiMemoryMb', 1769),
    httpThrottle: throttle(node, 'httpThrottle', { rateLimit: 25, burstLimit: 50 }),
    wsThrottle: throttle(node, 'wsThrottle', { rateLimit: 10, burstLimit: 20 }),
    apiAssetPath: path.resolve(repoRoot, node.tryGetContext('apiAssetPath') ?? 'artifacts/lambda/api'),
    wsConnectAssetPath: path.resolve(repoRoot, node.tryGetContext('wsConnectAssetPath') ?? 'artifacts/lambda/ws-connect'),
  };
}
