# Chip Tracker AWS CDK Infrastructure

Infrastructure-as-Code for Chip Tracker application using AWS CDK (TypeScript).

## Architecture

### Services

**Compute:**
- ECS Fargate cluster running backend service
- Auto-scaling based on CPU/memory utilization
- CloudWatch logs for monitoring

**Networking:**
- Application Load Balancer (ALB) for backend
- CloudFront CDN distribution for global acceleration
- VPC with public/private subnets

**Database:**
- DynamoDB table for game room state
- TTL enabled for automatic cleanup
- Point-in-time recovery in production

**Container Registry:**
- ECR repositories for backend and frontend images
- Image scanning enabled

**Storage:**
- S3 bucket for frontend assets (optional)

## Prerequisites

1. **AWS Account** with credentials configured
   ```bash
   aws configure
   ```

2. **Node.js 18+** and npm

3. **AWS CDK CLI**
   ```bash
   npm install -g aws-cdk
   ```

4. **Docker** (for building and pushing images)

## Setup

### 1. Install Dependencies

```bash
cd infra
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and update:

```bash
cp .env.example .env
```

Edit `.env`:
```
AWS_REGION=us-east-1
AWS_ACCOUNT=123456789012  # Your AWS Account ID
CDK_ENV=dev               # dev or prod
```

### 3. Bootstrap AWS Account (First Time Only)

```bash
cdk bootstrap aws://123456789012/us-east-1
```

## Deployment

### Develop Environment

```bash
# Build TypeScript
npm run build

# Synthesize CloudFormation template
npm run synth

# Preview changes
npm run diff

# Deploy
npm run deploy
```

### Production Environment

```bash
npm run deploy:prod
```

## After Deployment

### 1. Build and Push Docker Images

**Backend:**
```bash
cd ../src/backend
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <backend-ecr-uri>
docker build -t chip-tracker-backend:latest .
docker tag chip-tracker-backend:latest <backend-ecr-uri>:latest
docker push <backend-ecr-uri>:latest
```

**Frontend:**
```bash
cd ../frontend
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <frontend-ecr-uri>
docker build -t chip-tracker-frontend:latest .
docker tag chip-tracker-frontend:latest <frontend-ecr-uri>:latest
docker push <frontend-ecr-uri>:latest
```

### 2. Verify Deployment

```bash
# Get stack outputs
aws cloudformation describe-stacks --stack-name chip-tracker-dev --region us-east-1 | jq '.Stacks[0].Outputs'

# Check ECS service
aws ecs describe-services \
  --cluster chip-tracker-cluster \
  --services chip-tracker-backend \
  --region us-east-1
```

### 3. Monitor Application

**CloudWatch Logs:**
```bash
# Backend logs
aws logs tail /ecs/chip-tracker/backend --follow --region us-east-1
```

**CloudWatch Metrics:**
- Visit AWS Console → CloudWatch → Dashboards
- View ECS service metrics (CPU, memory, task count)

## Infrastructure Details

### Stack Components

#### DynamoDB Table
- **Name**: `chip-tracker-rooms`
- **Partition Key**: `RoomCode` (String)
- **Billing**: Pay-per-request
- **TTL**: Automatic cleanup of expired games
- **Backup**: Point-in-time recovery (prod only)

#### ECS Cluster
- **Name**: `chip-tracker-cluster`
- **Launch Type**: Fargate
- **Desired Count**: 1 (dev) / 2 (prod)
- **CPU**: 512 (dev) / 1024 (prod)
- **Memory**: 1024 MiB (dev) / 2048 MiB (prod)
- **Container Insights**: Enabled

#### Load Balancer
- **Type**: Application Load Balancer
- **Scheme**: Internet-facing
- **Health Check**: `/health` endpoint
  - Interval: 30s
  - Timeout: 10s
  - Healthy threshold: 2
  - Unhealthy threshold: 3

#### Auto-Scaling Policies
- **Min Tasks**: 1 (dev) / 2 (prod)
- **Max Tasks**: 2 (dev) / 4 (prod)
- **CPU Target**: 70%
- **Memory Target**: 80%

#### CloudFront Distribution
- **Origins**: ALB (backend)
- **Cache Behaviors**:
  - `/api/*` - No caching, all HTTP methods
  - `/hubs/*` - No caching, all HTTP methods (SignalR)
  - Default - Cached, optimized for static assets
- **Error Handling**: 404 → /index.html (SPA routing)

## Common Tasks

### Scale Service

```bash
# Set desired count
aws ecs update-service \
  --cluster chip-tracker-cluster \
  --service chip-tracker-backend \
  --desired-count 3 \
  --region us-east-1
```

### Update Image

```bash
# Force new task deployment
aws ecs update-service \
  --cluster chip-tracker-cluster \
  --service chip-tracker-backend \
  --force-new-deployment \
  --region us-east-1
```

### View Logs

```bash
# Real-time logs
aws logs tail /ecs/chip-tracker/backend --follow

# Last 100 lines
aws logs tail /ecs/chip-tracker/backend --max-items 100
```

### Destroy Infrastructure

**⚠️ WARNING: This will delete all resources**

```bash
npm run destroy
```

## Costs

### Estimated Monthly (Development)

- **ECS Fargate**: ~$10-15 (1 task × 512 CPU, 1GB RAM)
- **ALB**: ~$16
- **DynamoDB**: ~$1-5 (pay-per-request)
- **NAT Gateway**: ~$32
- **CloudFront**: Minimal for low traffic
- **Data Transfer**: Minimal

**Total**: ~$60-80/month

### Estimated Monthly (Production)

- **ECS Fargate**: ~$30-40 (2-3 tasks)
- **ALB**: ~$16
- **DynamoDB**: ~$10-20
- **NAT Gateways**: ~$64 (2 gateways)
- **CloudFront**: Depends on traffic

**Total**: ~$150-250/month

## Troubleshooting

### Tasks failing to start

```bash
# Check task logs
aws ecs describe-tasks \
  --cluster chip-tracker-cluster \
  --tasks <task-arn> \
  --region us-east-1
```

### Cannot connect to backend

1. Verify security group rules allow ALB → backend on port 5000
2. Check ALB target group health checks
3. Verify ECS task is running (desired count = running count)
4. Check CloudWatch logs

### DynamoDB permission errors

```bash
# Verify IAM role has DynamoDB permissions
aws iam get-role-policy \
  --role-name chip-tracker-devChipTrackerStackBackendTaskDefTaskRole-XXX \
  --policy-name DynamoDBAccess
```

## References

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [ECS on Fargate](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ECS_on_Fargate.html)
- [DynamoDB Pricing](https://aws.amazon.com/dynamodb/pricing/)
