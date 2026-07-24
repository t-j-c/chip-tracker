import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import { Construct } from 'constructs';

export interface ChipTrackerStackProps extends cdk.StackProps {
  projectName: string;
  environment: 'dev' | 'prod';
}

export class ChipTrackerStack extends cdk.Stack {
  public readonly backendLoadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly ecrBackend: ecr.Repository;
  public readonly ecrFrontend: ecr.Repository;

  constructor(scope: Construct, id: string, props: ChipTrackerStackProps) {
    super(scope, id, props);

    const { projectName, environment } = props;
    const isProduction = environment === 'prod';

    // VPC
    const vpc = new ec2.Vpc(this, 'Vpc', {
      cidr: '10.0.0.0/16',
      natGateways: isProduction ? 2 : 1,
      maxAzs: isProduction ? 3 : 2,
    });

    // DynamoDB Table
    const gameRoomsTable = new dynamodb.Table(this, 'GameRoomsTable', {
      tableName: `${projectName}-rooms`,
      partitionKey: {
        name: 'RoomCode',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: isProduction,
      ttl: {
        attributeName: 'ExpirationTime',
        enabled: true,
      },
    });

    // ECR Repositories
    this.ecrBackend = new ecr.Repository(this, 'BackendRepository', {
      repositoryName: `${projectName}/backend`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      imageScanOnPush: true,
      encryptionKey: isProduction ? undefined : undefined,
    });

    this.ecrFrontend = new ecr.Repository(this, 'FrontendRepository', {
      repositoryName: `${projectName}/frontend`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      imageScanOnPush: true,
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'EcsCluster', {
      vpc,
      clusterName: `${projectName}-cluster`,
      containerInsights: true,
    });

    // Security Group for ALB
    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for ALB',
    });
    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP'
    );
    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS'
    );

    // Security Group for Backend Task
    const backendSecurityGroup = new ec2.SecurityGroup(this, 'BackendSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for backend task',
    });
    backendSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(5000),
      'Allow ALB to backend'
    );

    // CloudWatch Logs
    const backendLogGroup = new logs.LogGroup(this, 'BackendLogGroup', {
      logGroupName: `/ecs/${projectName}/backend`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_WEEK,
    });

    // Backend Task Definition
    const backendTaskDefinition = new ecs.FargateTaskDefinition(
      this,
      'BackendTaskDef',
      {
        memoryLimitMiB: isProduction ? 2048 : 1024,
        cpu: isProduction ? 1024 : 512,
      }
    );

    backendTaskDefinition.addContainer('backend', {
      image: ecs.ContainerImage.fromEcrRepository(this.ecrBackend, 'latest'),
      logging: ecs.LogDriver.awsLogs({
        logGroup: backendLogGroup,
        streamPrefix: 'ecs',
      }),
      environment: {
        ASPNETCORE_ENVIRONMENT: isProduction ? 'Production' : 'Development',
        ASPNETCORE_URLS: 'http://+:5000',
        AWS_REGION: this.region,
      },
      secrets: {
        DYNAMODB_TABLE_NAME: cdk.SecretValue.plainSecretValue(gameRoomsTable.tableName),
      },
      portMappings: [
        {
          containerPort: 5000,
          protocol: ecs.Protocol.TCP,
        },
      ],
    });

    // Backend Service
    const backendService = new ecs.FargateService(
      this,
      'BackendService',
      {
        cluster,
        taskDefinition: backendTaskDefinition,
        desiredCount: isProduction ? 2 : 1,
        serviceName: `${projectName}-backend`,
        securityGroups: [backendSecurityGroup],
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      }
    );

    // Grant DynamoDB access to backend task
    gameRoomsTable.grantReadWriteData(backendTaskDefinition.taskRole);

    // Auto-scaling for backend
    const backendScaling = backendService.autoScaleTaskCount({
      minCapacity: isProduction ? 2 : 1,
      maxCapacity: isProduction ? 4 : 2,
    });
    backendScaling.scaleOnCpuUtilization('BackendCpuScaling', {
      targetUtilizationPercent: 70,
    });
    backendScaling.scaleOnMemoryUtilization('BackendMemoryScaling', {
      targetUtilizationPercent: 80,
    });

    // Application Load Balancer
    this.backendLoadBalancer = new elbv2.ApplicationLoadBalancer(
      this,
      'BackendAlb',
      {
        vpc,
        internetFacing: true,
        loadBalancerName: `${projectName}-backend-alb`,
        securityGroup: albSecurityGroup,
      }
    );

    // ALB Target Group
    const backendTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      'BackendTargetGroup',
      {
        vpc,
        port: 5000,
        targetType: elbv2.TargetType.IP,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targetGroupName: `${projectName}-backend-tg`,
        healthCheck: {
          path: '/health',
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(10),
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
        },
      }
    );

    // Attach service to target group
    backendService.attachToApplicationTargetGroup(backendTargetGroup);

    // ALB Listener
    this.backendLoadBalancer.addListener('BackendListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [backendTargetGroup],
    });

    // S3 Bucket for Frontend (for future use)
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `${projectName}-frontend-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
    });

    // CloudFront Distribution for Frontend
    const distribution = new cloudfront.Distribution(
      this,
      'FrontendDistribution',
      {
        defaultBehavior: {
          origin: new cloudfront.origins.LoadBalancerOrigin(
            this.backendLoadBalancer,
            {
              protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            }
          ),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
        },
        additionalBehaviors: {
          '/api/*': {
            origin: new cloudfront.origins.LoadBalancerOrigin(
              this.backendLoadBalancer,
              {
                protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
              }
            ),
            viewerProtocolPolicy:
              cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
            compress: true,
          },
          '/hubs/*': {
            origin: new cloudfront.origins.LoadBalancerOrigin(
              this.backendLoadBalancer,
              {
                protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
              }
            ),
            viewerProtocolPolicy:
              cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
            compress: true,
          },
        },
        errorResponses: [
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.seconds(0),
          },
        ],
      }
    );

    // Outputs
    new cdk.CfnOutput(this, 'BackendLoadBalancerUrl', {
      value: this.backendLoadBalancer.loadBalancerDnsName,
      description: 'Backend ALB DNS Name',
      exportName: `${projectName}-alb-url`,
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: distribution.distributionDomainName,
      description: 'CloudFront Distribution Domain',
      exportName: `${projectName}-cf-domain`,
    });

    new cdk.CfnOutput(this, 'DynamoDBTableName', {
      value: gameRoomsTable.tableName,
      description: 'DynamoDB Table Name',
      exportName: `${projectName}-table-name`,
    });

    new cdk.CfnOutput(this, 'BackendEcrUri', {
      value: this.ecrBackend.repositoryUri,
      description: 'Backend ECR Repository URI',
      exportName: `${projectName}-backend-ecr-uri`,
    });

    new cdk.CfnOutput(this, 'FrontendEcrUri', {
      value: this.ecrFrontend.repositoryUri,
      description: 'Frontend ECR Repository URI',
      exportName: `${projectName}-frontend-ecr-uri`,
    });
  }
}
