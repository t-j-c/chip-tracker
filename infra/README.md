# Chip Tracker Infrastructure (AWS CDK)

Serverless production stack for `https://deal-me-in.com`. The design, costs and rollout plan are in [planning/MVP/deployment-plan.md](../planning/MVP/deployment-plan.md).

```
Route 53 (deal-me-in.com) ─► CloudFront (ACM cert, PriceClass_100)
                              ├─ default → S3 (private, OAC) + CloudFront Function SPA rewrite
                              ├─ /api/*  → API Gateway HTTP API ($default, throttled) → Lambda "Api" (ASP.NET Core)
                              └─ /ws     → API Gateway WebSocket API (stage "ws", throttled)
                                             ├─ $connect → Lambda "WsConnect"
                                             └─ $default → MOCK (keep-alive ping)
DynamoDB: Rooms (RETAIN, TTL) + Connections (TTL)
Ops: CloudWatch alarms → SNS email, $5/mo AWS Budget, 14-day logs, tag app=chip-tracker
```

At family scale this costs about **$0.55/month**, almost all of it the Route 53 hosted zone. There is no VPC, NAT, load balancer, ECS or ECR.

## Layout

| File | Purpose |
|---|---|
| `src/index.ts` | CDK app for the production stack `chip-tracker-prod` (always us-east-1) |
| `src/config.ts` | Reads and validates CDK context |
| `src/stack.ts` | The stack |
| `src/oidc-app.ts`, `src/oidc-stack.ts` | One-time bootstrap: GitHub Actions OIDC provider + deploy role |
| `test/stack.test.ts` | Jest assertion tests (`npm test`) |

## Configuration

Committed in [cdk.json](./cdk.json) `context`:

| Key | Default | Notes |
|---|---|---|
| `domainName` | `deal-me-in.com` | CloudFront alias + ACM certificate |
| `hostedZoneId` / `hostedZoneName` | `Z0347011UK8LW7XIFFUB` / `deal-me-in.com` | Existing Route 53 zone (no lookups) |
| `monthlyBudgetUsd` | `5` | Emails at 80% actual and 100% forecast |
| `apiMemoryMb` | `1769` | One full vCPU; chosen in spike S2 for cold starts under 2 s |
| `httpThrottle` | `{"rateLimit":25,"burstLimit":50}` | HTTP API stage throttle: the global cost/abuse cap |
| `wsThrottle` | `{"rateLimit":10,"burstLimit":20}` | WebSocket stage throttle |

**Not committed**, because the repo is public:

| Key | How to supply it |
|---|---|
| `alertEmail` (required) | `-c alertEmail=you@example.com`. CI uses the GitHub variable `ALERT_EMAIL`. Synth fails if it is missing. |

Any key can be overridden with `-c key=value`, e.g. `-c httpThrottle='{"rateLimit":50,"burstLimit":100}'`.

The optional context keys `apiAssetPath` and `wsConnectAssetPath` default to `artifacts/lambda/api` and `artifacts/lambda/ws-connect` (relative to the repo root).

## Build, test, synth

```powershell
pwsh scripts/publish-lambdas.ps1   # from the repo root: linux-arm64 ReadyToRun bundles → artifacts/lambda/
cd infra
npm ci
npm run build                      # type-check
npm test                           # assertion tests (no AWS access or bundles needed)
npx cdk synth -c alertEmail=you@example.com
```

## Deploy

Normal deploys run from GitHub Actions on merge to `main` (deployment plan Phase 3). For a manual deploy with admin credentials:

```powershell
pwsh scripts/deploy-infra.ps1 -AlertEmail you@example.com             # publish bundles, diff, deploy
pwsh scripts/deploy-infra.ps1 -AlertEmail you@example.com -NoDeploy   # publish bundles, synth + diff only
```

`cdk deploy` uploads both Lambda bundles, so infra and backend code ship together. The SPA is uploaded separately:

```powershell
cd src/frontend; npm ci; npm run build
aws s3 sync dist s3://<FrontendBucketName> --delete --cache-control "public,max-age=31536000,immutable" --exclude index.html
aws s3 cp dist/index.html s3://<FrontendBucketName>/index.html --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id <DistributionId> --paths /index.html
```

Stack outputs: `SiteUrl`, `DistributionId`, `FrontendBucketName`, `ApiFunctionName`, `WsConnectFunctionName`, `HttpApiId`, `WebSocketApiId`, `RoomsTableName`, `ConnectionsTableName`.

### One-time bootstrap (first deploy only)

See [deployment plan Phase 4](../planning/MVP/deployment-plan.md):

1. `npx cdk bootstrap aws://<account>/us-east-1`.
2. `npx cdk deploy --app "npx ts-node src/oidc-app.ts" -c githubRepo=t-j-c/chip-tracker`. If the account already has a GitHub OIDC provider (`aws iam list-open-id-connect-providers`), add `-c oidcProviderArn=<that arn>` to reuse it.
3. Put the `DeployRoleArn` output into the GitHub secret `AWS_ROLE_TO_ASSUME`.
4. Create the GitHub environment `production` and the variables `AWS_REGION`, `SITE_DOMAIN`, `ALERT_EMAIL`.
5. The first deploy waits for ACM DNS validation, about 5–30 min.
6. Confirm the SNS subscription email.
7. Activate the `app` cost allocation tag. The budget only counts spend tagged `app=chip-tracker`, and reports $0 until the tag is active. The tag appears in Billing about 24 h after the first tagged resource exists.

## Runbook

| Task | How |
|---|---|
| Deploy | Merge to `main`. |
| Roll back | Dispatch `deploy.yml` with `ref=<good commit>`. |
| Logs | `aws logs tail /aws/lambda/<ApiFunctionName> --follow` (same for `<WsConnectFunctionName>`). |
| **Kill switch** (runaway cost or abuse) | `aws lambda put-function-concurrency --function-name <ApiFunctionName> --reserved-concurrent-executions 0`, and the same for `WsConnect`. Undo with `aws lambda delete-function-concurrency --function-name <name>`. |
| Raise limits | Edit `httpThrottle` / `wsThrottle` / `apiMemoryMb` in `cdk.json` and merge. |
| Inspect or clear a room | `aws dynamodb get-item` / `delete-item --table-name <RoomsTableName> --key '{"RoomCode":{"S":"ABC123"}}'` |
| Cost check | The budget email, or Cost Explorer filtered by tag `app=chip-tracker`. |

The `Rooms` table is retained if the stack is deleted (`RemovalPolicy.RETAIN`). The connections table, bucket and logs are deleted.
