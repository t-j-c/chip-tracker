import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export interface ThrottleConfig {
  rateLimit: number;
  burstLimit: number;
}

export interface ChipTrackerStackProps extends cdk.StackProps {
  domainName: string;
  hostedZoneId: string;
  hostedZoneName: string;
  alertEmail: string;
  monthlyBudgetUsd: number;
  apiMemoryMb: number;
  httpThrottle: ThrottleConfig;
  wsThrottle: ThrottleConfig;
  /** Output of scripts/publish-lambdas.ps1 (artifacts/lambda/api). */
  apiAssetPath: string;
  /** Output of scripts/publish-lambdas.ps1 (artifacts/lambda/ws-connect). */
  wsConnectAssetPath: string;
}

/**
 * Serverless production stack: CloudFront (S3 SPA, /api/* → HTTP API → Lambda, /ws → API Gateway WebSocket)
 * + DynamoDB. See planning/MVP/deployment-plan.md Phase 2.
 */
export class ChipTrackerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ChipTrackerStackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add('app', 'chip-tracker');

    // ── Data ────────────────────────────────────────────────────────────────
    const rooms = new dynamodb.Table(this, 'Rooms', {
      partitionKey: { name: 'RoomCode', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ExpirationTime',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const connections = new dynamodb.Table(this, 'Connections', {
      partitionKey: { name: 'RoomCode', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'ConnectionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ExpirationTime',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const wsApi = new apigwv2.WebSocketApi(this, 'WsApi', {
      routeSelectionExpression: '$request.body.action',
    });
    // Must match the CloudFront path so /ws maps onto the stage without an origin path.
    const wsStageName = 'ws';

    // ── Compute ─────────────────────────────────────────────────────────────
    const logGroup = (fnId: string) =>
      new logs.LogGroup(this, `${fnId}Logs`, {
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

    const commonFunctionProps = {
      runtime: lambda.Runtime.DOTNET_10,
      architecture: lambda.Architecture.ARM_64,
      loggingFormat: lambda.LoggingFormat.JSON,
      applicationLogLevelV2: lambda.ApplicationLogLevel.INFO,
      systemLogLevelV2: lambda.SystemLogLevel.WARN,
    };
    const tableEnv = {
      DynamoDB__TableName: rooms.tableName,
      DynamoDB__ConnectionsTableName: connections.tableName,
    };

    const apiFn = new lambda.Function(this, 'Api', {
      ...commonFunctionProps,
      handler: 'ChipTracker.Presentation',
      code: lambda.Code.fromAsset(props.apiAssetPath),
      memorySize: props.apiMemoryMb,
      timeout: cdk.Duration.seconds(15),
      logGroup: logGroup('Api'),
      environment: {
        ...tableEnv,
        ASPNETCORE_ENVIRONMENT: 'Production',
        DynamoDB__RoomTtlDays: '1',
        Realtime__Mode: 'ApiGateway',
        Realtime__ManagementEndpoint: `https://${wsApi.apiId}.execute-api.${this.region}.amazonaws.com/${wsStageName}`,
        RateLimiting__ClientIpSource: 'CloudFrontViewerAddress',
      },
    });
    rooms.grantReadWriteData(apiFn);
    connections.grantReadWriteData(apiFn);
    wsApi.grantManageConnections(apiFn);

    const wsConnectFn = new lambda.Function(this, 'WsConnect', {
      ...commonFunctionProps,
      handler: 'ChipTracker.WsConnect::ChipTracker.WsConnect.Function::HandleConnectAsync',
      code: lambda.Code.fromAsset(props.wsConnectAssetPath),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(5),
      logGroup: logGroup('WsConnect'),
      environment: tableEnv,
    });
    rooms.grantReadData(wsConnectFn);
    connections.grantWriteData(wsConnectFn);

    // ── APIs ────────────────────────────────────────────────────────────────
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', { createDefaultStage: false });
    // Construct ID must not be 'Default' (CDK treats it like 'Resource' and logical IDs collide).
    httpApi.addStage('DefaultStage', {
      stageName: '$default',
      autoDeploy: true,
      throttle: props.httpThrottle,
    });
    httpApi.addRoutes({
      path: '/api/{proxy+}',
      methods: [apigwv2.HttpMethod.ANY],
      integration: new integrations.HttpLambdaIntegration('ApiIntegration', apiFn),
    });

    wsApi.addRoute('$connect', {
      integration: new integrations.WebSocketLambdaIntegration('ConnectIntegration', wsConnectFn),
    });
    // Keep-alive: the client sends {"action":"ping"} and the MOCK integration swallows it. It needs a
    // request template AND an integration response, otherwise every ping gets "Internal server error".
    // Built from L1 constructs because the L2 mock integration doesn't expose its integration ID.
    const pingIntegration = new apigwv2.CfnIntegration(this, 'PingIntegration', {
      apiId: wsApi.apiId,
      integrationType: 'MOCK',
      requestTemplates: { $default: '{"statusCode": 200}' },
      templateSelectionExpression: '\\$default',
    });
    new apigwv2.CfnIntegrationResponse(this, 'PingIntegrationResponse', {
      apiId: wsApi.apiId,
      integrationId: pingIntegration.ref,
      integrationResponseKey: '$default',
    });
    new apigwv2.CfnRoute(this, 'PingRoute', {
      apiId: wsApi.apiId,
      routeKey: '$default',
      target: `integrations/${pingIntegration.ref}`,
    });
    new apigwv2.WebSocketStage(this, 'WsStage', {
      webSocketApi: wsApi,
      stageName: wsStageName,
      autoDeploy: true,
      throttle: props.wsThrottle,
    });

    // ── Edge ────────────────────────────────────────────────────────────────
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.hostedZoneName,
    });
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    const siteBucket = new s3.Bucket(this, 'FrontendBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Extensionless paths (client-side routes) serve the SPA. Replaces the distribution-wide
    // 404 → index.html error response, which also rewrote API 404s.
    const spaRewrite = new cloudfront.Function(this, 'SpaRewrite', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(`function handler(event) {
  var r = event.request;
  if (r.uri.lastIndexOf('.') <= r.uri.lastIndexOf('/')) r.uri = '/index.html';
  return r;
}`),
    });

    // Never forward Host: API Gateway rejects requests whose Host isn't its own domain.
    const apiOriginPolicy = new cloudfront.OriginRequestPolicy(this, 'ApiOriginPolicy', {
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
      cookieBehavior: cloudfront.OriginRequestCookieBehavior.none(),
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList(
        'Content-Type', 'Accept', 'Origin', 'CloudFront-Viewer-Address'),
    });
    const wsOriginPolicy = new cloudfront.OriginRequestPolicy(this, 'WsOriginPolicy', {
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
      cookieBehavior: cloudfront.OriginRequestCookieBehavior.none(),
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList(
        'Sec-WebSocket-Key', 'Sec-WebSocket-Version', 'Sec-WebSocket-Protocol',
        'Sec-WebSocket-Accept', 'Sec-WebSocket-Extensions'),
    });

    const executeApiOrigin = (apiId: string) =>
      new origins.HttpOrigin(`${apiId}.execute-api.${this.region}.amazonaws.com`, {
        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      domainNames: [props.domainName],
      certificate,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        functionAssociations: [{ function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        '/api/*': {
          origin: executeApiOrigin(httpApi.apiId),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: apiOriginPolicy,
        },
        [`/${wsStageName}`]: {
          origin: executeApiOrigin(wsApi.apiId),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: wsOriginPolicy,
        },
      },
    });

    const aliasTarget = route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(distribution));
    new route53.ARecord(this, 'SiteARecord', { zone, recordName: props.domainName, target: aliasTarget });
    new route53.AaaaRecord(this, 'SiteAaaaRecord', { zone, recordName: props.domainName, target: aliasTarget });

    // ── Guardrails & ops ────────────────────────────────────────────────────
    const alertTopic = new sns.Topic(this, 'AlertTopic', { displayName: 'Chip Tracker alerts' });
    alertTopic.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));
    const alarmAction = new cwActions.SnsAction(alertTopic);
    const period = cdk.Duration.minutes(5);

    const addAlarm = (id: string, metric: cloudwatch.IMetric, threshold: number, description: string) => {
      const alarm = new cloudwatch.Alarm(this, id, {
        metric,
        threshold,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: description,
      });
      alarm.addAlarmAction(alarmAction);
    };

    addAlarm('ApiErrorsAlarm', apiFn.metricErrors({ period }), 5, 'Api Lambda errors (≥5 in 5 min)');
    addAlarm('ApiThrottlesAlarm', apiFn.metricThrottles({ period }), 1, 'Api Lambda throttled (concurrency limit hit)');
    addAlarm('HttpApi5xxAlarm', httpApi.metricServerError({ period }), 5, 'HTTP API 5xx responses (≥5 in 5 min)');
    addAlarm('WsConnectErrorsAlarm', wsConnectFn.metricErrors({ period }), 5, 'WsConnect Lambda errors (≥5 in 5 min)');
    // One alarm over both tables' read/write throttle events (4 alarm metrics, inside the free 10).
    const throttleMetrics: Record<string, cloudwatch.IMetric> = {};
    [rooms, connections].forEach((table, i) => {
      throttleMetrics[`r${i}`] = table.metric('ReadThrottleEvents', { statistic: 'Sum', period });
      throttleMetrics[`w${i}`] = table.metric('WriteThrottleEvents', { statistic: 'Sum', period });
    });
    addAlarm('DynamoDbThrottlesAlarm', new cloudwatch.MathExpression({
      expression: Object.keys(throttleMetrics).map(k => `FILL(${k}, 0)`).join(' + '),
      usingMetrics: throttleMetrics,
      period,
      label: 'DynamoDB throttle events (both tables)',
    }), 1, 'DynamoDB throttle events on Rooms or Connections');

    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: 'chip-tracker-monthly',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: props.monthlyBudgetUsd, unit: 'USD' },
        // The account hosts other apps; only count this app's tagged spend.
        // Requires the `app` cost allocation tag to be activated in Billing.
        costFilters: { TagKeyValue: ['user:app$chip-tracker'] },
      },
      notificationsWithSubscribers: [
        { type: 'ACTUAL', threshold: 80 },
        { type: 'FORECASTED', threshold: 100 },
      ].map(n => ({
        notification: {
          notificationType: n.type,
          comparisonOperator: 'GREATER_THAN',
          threshold: n.threshold,
          thresholdType: 'PERCENTAGE',
        },
        subscribers: [{ subscriptionType: 'EMAIL', address: props.alertEmail }],
      })),
    });

    // ── Outputs ─────────────────────────────────────────────────────────────
    const outputs: Record<string, string> = {
      SiteUrl: `https://${props.domainName}`,
      DistributionId: distribution.distributionId,
      FrontendBucketName: siteBucket.bucketName,
      ApiFunctionName: apiFn.functionName,
      WsConnectFunctionName: wsConnectFn.functionName,
      HttpApiId: httpApi.apiId,
      WebSocketApiId: wsApi.apiId,
      RoomsTableName: rooms.tableName,
      ConnectionsTableName: connections.tableName,
    };
    for (const [name, value] of Object.entries(outputs)) {
      new cdk.CfnOutput(this, name, { value });
    }
  }
}
