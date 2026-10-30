import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { readStackConfig } from '../src/config';
import { ChipTrackerStack } from '../src/stack';

function fakeAsset(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `chip-tracker-${name}-`));
  fs.writeFileSync(path.join(dir, 'placeholder.dll'), 'test');
  return dir;
}

const context = {
  domainName: 'deal-me-in.com',
  hostedZoneId: 'Z0347011UK8LW7XIFFUB',
  hostedZoneName: 'deal-me-in.com',
  alertEmail: 'alerts@example.com',
  apiAssetPath: fakeAsset('api'),
  wsConnectAssetPath: fakeAsset('ws-connect'),
};

function synth(extraContext: Record<string, unknown> = {}): Template {
  const app = new cdk.App({ context: { ...context, ...extraContext } });
  const stack = new ChipTrackerStack(app, 'chip-tracker-prod', {
    ...readStackConfig(app.node),
    env: { account: '123456789012', region: 'us-east-1' },
  });
  return Template.fromStack(stack);
}

const template = synth();

function distributionConfig(): any {
  const dists = Object.values(template.findResources('AWS::CloudFront::Distribution'));
  expect(dists).toHaveLength(1);
  return (dists[0] as any).Properties.DistributionConfig;
}

function behavior(pathPattern: string): any {
  const b = distributionConfig().CacheBehaviors.find((c: any) => c.PathPattern === pathPattern);
  expect(b).toBeDefined();
  return b;
}

function originRequestPolicyFor(pathPattern: string): any {
  const ref = behavior(pathPattern).OriginRequestPolicyId.Ref;
  return template.toJSON().Resources[ref].Properties.OriginRequestPolicyConfig;
}

const CACHING_DISABLED_ID = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad';

describe('ChipTrackerStack', () => {
  test('has no VPC, ECS, load balancer or ECR resources', () => {
    const types = Object.values(template.toJSON().Resources).map((r: any) => r.Type as string);
    for (const prefix of ['AWS::EC2::', 'AWS::ECS::', 'AWS::ElasticLoadBalancingV2::', 'AWS::ECR::']) {
      expect(types.filter(t => t.startsWith(prefix))).toEqual([]);
    }
  });

  test('Api and WsConnect functions run dotnet10 on arm64 with the planned memory', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'ChipTracker.Presentation',
      Runtime: 'dotnet10',
      Architectures: ['arm64'],
      MemorySize: 1769,
      Timeout: 15,
      LoggingConfig: Match.objectLike({ LogFormat: 'JSON' }),
      Environment: {
        Variables: Match.objectLike({
          Realtime__Mode: 'ApiGateway',
          RateLimiting__ClientIpSource: 'CloudFrontViewerAddress',
          Realtime__ManagementEndpoint: Match.anyValue(),
          DynamoDB__TableName: Match.anyValue(),
          DynamoDB__ConnectionsTableName: Match.anyValue(),
        }),
      },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'ChipTracker.WsConnect::ChipTracker.WsConnect.Function::HandleConnectAsync',
      Runtime: 'dotnet10',
      Architectures: ['arm64'],
      MemorySize: 1024,
      Timeout: 5,
    });
  });

  test('function log groups keep 14 days', () => {
    template.resourcePropertiesCountIs('AWS::Logs::LogGroup', { RetentionInDays: 14 }, 2);
  });

  test('Rooms table is retained; Connections table has the composite key; both use TTL', () => {
    template.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Retain',
      Properties: Match.objectLike({
        KeySchema: [{ AttributeName: 'RoomCode', KeyType: 'HASH' }],
        BillingMode: 'PAY_PER_REQUEST',
        TimeToLiveSpecification: { AttributeName: 'ExpirationTime', Enabled: true },
      }),
    });
    template.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Delete',
      Properties: Match.objectLike({
        KeySchema: [
          { AttributeName: 'RoomCode', KeyType: 'HASH' },
          { AttributeName: 'ConnectionId', KeyType: 'RANGE' },
        ],
        TimeToLiveSpecification: { AttributeName: 'ExpirationTime', Enabled: true },
      }),
    });
  });

  test('WebSocket API has $connect and $default routes, no $disconnect, and a throttled "ws" stage', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      ProtocolType: 'WEBSOCKET',
      RouteSelectionExpression: '$request.body.action',
    });
    const routeKeys = Object.values(template.findResources('AWS::ApiGatewayV2::Route'))
      .map((r: any) => r.Properties.RouteKey);
    expect(routeKeys).toEqual(expect.arrayContaining(['$connect', '$default', 'ANY /api/{proxy+}']));
    expect(routeKeys).not.toContain('$disconnect');

    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: 'ws',
      AutoDeploy: true,
      DefaultRouteSettings: Match.objectLike({ ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 }),
    });
  });

  test('keep-alive $default route is a MOCK with a request template and an integration response', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Integration', {
      IntegrationType: 'MOCK',
      RequestTemplates: { $default: '{"statusCode": 200}' },
      TemplateSelectionExpression: '\\$default',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::IntegrationResponse', {
      IntegrationResponseKey: '$default',
    });
  });

  test('HTTP API $default stage is throttled', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      AutoDeploy: true,
      DefaultRouteSettings: Match.objectLike({ ThrottlingRateLimit: 25, ThrottlingBurstLimit: 50 }),
    });
  });

  test('/ws behavior forwards the WebSocket handshake headers and all query strings, uncached', () => {
    expect(behavior('/ws').CachePolicyId).toBe(CACHING_DISABLED_ID);
    const policy = originRequestPolicyFor('/ws');
    expect(policy.QueryStringsConfig.QueryStringBehavior).toBe('all');
    expect(policy.HeadersConfig.HeaderBehavior).toBe('whitelist');
    expect(policy.HeadersConfig.Headers).toEqual(
      expect.arrayContaining(['Sec-WebSocket-Key', 'Sec-WebSocket-Version']));
  });

  test('/api/* behavior is uncached, allows all methods and never forwards Host', () => {
    const b = behavior('/api/*');
    expect(b.CachePolicyId).toBe(CACHING_DISABLED_ID);
    expect(b.AllowedMethods).toEqual(expect.arrayContaining(['POST', 'PUT', 'DELETE']));
    const policy = originRequestPolicyFor('/api/*');
    expect(policy.QueryStringsConfig.QueryStringBehavior).toBe('all');
    expect(policy.HeadersConfig.Headers).toContain('CloudFront-Viewer-Address');
    expect(policy.HeadersConfig.Headers.map((h: string) => h.toLowerCase())).not.toContain('host');
  });

  test('distribution uses the custom domain, SPA rewrite function and no 404 → index.html hack', () => {
    const config = distributionConfig();
    expect(config.Aliases).toEqual(['deal-me-in.com']);
    expect(config.PriceClass).toBe('PriceClass_100');
    expect(config.CustomErrorResponses).toBeUndefined();
    expect(config.DefaultCacheBehavior.FunctionAssociations).toEqual([
      expect.objectContaining({ EventType: 'viewer-request' }),
    ]);
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'deal-me-in.com',
      ValidationMethod: 'DNS',
    });
    for (const type of ['A', 'AAAA']) {
      template.hasResourceProperties('AWS::Route53::RecordSet', {
        Name: 'deal-me-in.com.',
        Type: type,
        HostedZoneId: 'Z0347011UK8LW7XIFFUB',
      });
    }
  });

  test('budget, alert email and alarms exist', () => {
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: Match.objectLike({
        BudgetLimit: { Amount: 5, Unit: 'USD' },
        TimeUnit: 'MONTHLY',
        CostFilters: { TagKeyValue: ['user:app$chip-tracker'] },
      }),
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({ Subscribers: [{ SubscriptionType: 'EMAIL', Address: 'alerts@example.com' }] }),
      ]),
    });
    template.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'alerts@example.com',
    });
    template.resourceCountIs('AWS::CloudWatch::Alarm', 5);
  });

  test('Api can manage WebSocket connections', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 'execute-api:ManageConnections', Effect: 'Allow' }),
        ]),
      },
    });
  });

  test('every planned output is present', () => {
    for (const name of ['SiteUrl', 'DistributionId', 'FrontendBucketName', 'ApiFunctionName',
      'WsConnectFunctionName', 'HttpApiId', 'WebSocketApiId', 'RoomsTableName', 'ConnectionsTableName']) {
      template.hasOutput(name, {});
    }
  });
});

describe('readStackConfig', () => {
  test('fails clearly when alertEmail is missing', () => {
    const app = new cdk.App({ context: { ...context, alertEmail: undefined } });
    expect(() => readStackConfig(app.node)).toThrow(/alertEmail/);
  });

  test('parses string overrides passed with -c', () => {
    const app = new cdk.App({
      context: { ...context, apiMemoryMb: '1024', httpThrottle: '{"rateLimit":50,"burstLimit":100}' },
    });
    const config = readStackConfig(app.node);
    expect(config.apiMemoryMb).toBe(1024);
    expect(config.httpThrottle).toEqual({ rateLimit: 50, burstLimit: 100 });
    expect(config.wsThrottle).toEqual({ rateLimit: 10, burstLimit: 20 });
  });

  test('rejects invalid throttle config', () => {
    const app = new cdk.App({ context: { ...context, wsThrottle: '{"rateLimit":0}' } });
    expect(() => readStackConfig(app.node)).toThrow(/wsThrottle/);
  });
});
