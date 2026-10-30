## Plan: Chip Tracker Public Deployment (Serverless AWS)

Take the working MVP from local Docker Compose to a public HTTPS site on our Route 53 domain, with push-to-deploy from `main`.

- **Cost:** about **$0.55/month** at family scale. That is the Route 53 hosted zone plus pennies.
- **Scaling:** automatic, with no servers to manage.

This plan **supersedes Phase 8 (CDK) and Phase 9 (CI/CD) of [detailed-design.md](./detailed-design.md)**, and the earlier EC2 revision of this plan (≈ $8/mo; see [Alternatives](#alternatives-considered)). The ECS Fargate + ALB + NAT stack built in Phase 8 was never deployed. It costs $60–150+/mo and has functional bugs ([Appendix C](#appendix-c-issues-in-the-existing-infra)).

Going serverless means replacing SignalR, which needs a long-lived server. That work, and the other app changes Lambda needs, are split into **three prerequisite plans**:

| # | Plan | What | Depends on |
|---|---|---|---|
| P1 | [room-concurrency-plan.md](./room-concurrency-plan.md) | `GameRoom.Revision`, conditional saves, MediatR retry on conflict | — |
| P2 | [realtime-rewrite-plan.md](./realtime-rewrite-plan.md) | SignalR → REST commands + API Gateway WebSocket push (in-process WebSocket locally) | P1 |
| P3 | [lambda-hosting-plan.md](./lambda-hosting-plan.md) | Same ASP.NET app on Lambda: hosting adapter, R2R arm64 packaging, client IP, warm-up | — |

---

### Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Compute | **AWS Lambda (`dotnet10`, arm64)**, running the existing ASP.NET Core app via `Amazon.Lambda.AspNetCoreServer.Hosting` | Pay per request. The always-free tier (1M requests + 400k GB-s/mo) covers family use with a large margin. Scales automatically. No OS to patch. |
| API front door | **API Gateway HTTP API** behind CloudFront `/api/*` | Stage throttling as a global cost and abuse cap. $1/M requests. |
| Real-time push | **API Gateway WebSocket API** behind CloudFront `/ws` | User decision (see [realtime-rewrite-plan.md](./realtime-rewrite-plan.md)). $1/M messages + $0.25/M connection-minutes. |
| Frontend | **S3 (private, OAC) + CloudFront**, CloudFront Function for SPA routing | Effectively free. Same origin as the API and WebSocket, so no CORS and the WebSocket URL derives from `location`. |
| Persistence | **DynamoDB on-demand**: `Rooms` (existing design, TTL) + `Connections` (new, TTL) | Already implemented. Pennies. |
| Domain / TLS | **Existing Route 53 domain + free ACM certificate** on CloudFront | The hosted zone already exists. |
| Environments | **Single `prod` stack.** Local Docker Compose is "dev". | A staging stack would now cost about $0 when idle, so it is easy to add later. |
| Region | **us-east-1** | The CloudFront certificate must live there. One region, one stack. |
| Cost guardrails | **API Gateway throttles + $5 AWS Budget + alarms + a "kill switch" runbook** | Pay-per-use needs a ceiling. No WAF ($5+/mo). |
| Deploy | **GitHub Actions (OIDC) → `cdk deploy`** (infra + Lambda code in one step) → S3 sync | No container registry and no SSH/SSM deploy scripts. |

#### Alternatives considered

| Option | Est. $/mo | Why not |
|---|---|---|
| EC2 `t4g.nano` + CloudFront, keeping SignalR (previous revision) | ~8 | Fixed cost dominated by the public IPv4 + instance. Single instance (SignalR groups in memory). We patch and own the box. |
| AppSync Events instead of API Gateway WebSocket | ~same | Fewer moving parts (no connection table or `$connect` Lambda) and 24-h connections. API Gateway WebSocket chosen for maturity. Still a contained swap behind `IRoomEventPublisher` if ever wanted. |
| Lambda Function URL instead of HTTP API | ~0 | With CloudFront OAC, browsers must send `x-amz-content-sha256` on POST bodies. Without OAC, the URL is public with no throttling. |
| Existing ECS Fargate + ALB + NAT | 60–150+ | ALB (~$16) and NAT (~$32) fixed costs. |
| Azure SignalR Service (Free) + Lambda | 0, then ~49 | Free tier is 20 connections and 20k messages/day; the next tier is ~$49/mo. Second vendor. |
| Client polling instead of push | ~0 | Worse UX, and cost scales with idle open tabs. |
| Fly.io / Google Cloud Run | ~0–4 | Second vendor. Static AWS keys for DynamoDB. Cloud Run caps WebSockets at 60 min. |

---

### Target Architecture

```
                       Route 53: <domain>  A/AAAA alias
                                     │
 Browser ──HTTPS/WSS──► CloudFront (ACM cert, PriceClass_100)
                         ├─ default (*) → S3 bucket (private, OAC)
                         │     viewer-request CloudFront Function: extensionless path → /index.html
                         ├─ /api/*  → API Gateway HTTP API ($default stage, throttled)
                         │             └─ ANY /api/{proxy+} → Lambda "Api"  (ASP.NET Core, dotnet10, arm64)
                         │                                      ├─ DynamoDB Rooms (RW), Connections (RW)
                         │                                      └─ PostToConnection (execute-api:ManageConnections)
                         └─ /ws     → API Gateway WebSocket API (stage "ws", throttled)
                                       ├─ $connect → Lambda "WsConnect" (Rooms: GetItem; Connections: PutItem)
                                       └─ $default → MOCK integration (client keep-alive ping; no Lambda)

 Ops: CloudWatch Logs (14-day retention), alarms → SNS email, AWS Budget ($5/mo)
 None of: VPC, NAT, load balancer, EC2, ECS, ECR
```

**Request flows**
1. **Load:** the SPA comes from S3 via CloudFront. The app fires a fire-and-forget `GET /api/health` to warm the API Lambda.
2. **Create / join / start:** REST → `Api` Lambda → DynamoDB.
3. **Enter a room:**
   1. The browser opens `wss://<domain>/ws?room=ABC123`.
   2. The `$connect` Lambda validates the room and records `(RoomCode, ConnectionId)`.
   3. The browser then fetches `GET /api/rooms/ABC123` and applies the snapshot.
4. **Command** (e.g. call):
   1. `POST /api/rooms/ABC123/actions` → `Api` Lambda.
   2. Load, apply, then conditional save (revision N+1).
   3. `PostToConnection` sends a revisioned snapshot to every connection in the room.
   4. HTTP 200 returns the same snapshot to the caller.
5. **Keep-alive / recovery:**
   - The client pings every 5 min (the idle timeout is 10 min).
   - It reconnects with backoff after any close, including API Gateway's 2-h cap, and resyncs via GET.
   - Stale connection rows are deleted on `410 Gone` or by TTL.

---

### Estimated Monthly Cost (us-east-1, on-demand, no free-tier credits assumed except always-free)

Approximate figures. Re-check in the AWS Pricing Calculator before go-live.

**Assumptions per game:** ~3 players, ~3 hours, ~300 commands, ~400 HTTP requests and ~1,000 WebSocket messages (events × connections + pings). Average room item ~40 KB, so a save is ~40 write units.

| Item | Family (≈5 games/mo) | Growth (≈1,000 games/mo) |
|---|---|---|
| Route 53 hosted zone (already incurred by the domain) | 0.50 | 0.50 |
| CloudFront (always-free: 1 TB egress, 10M requests, 2M function invocations) | 0 | 0 |
| S3 static assets (<100 MB) | <0.01 | <0.01 |
| API Gateway HTTP API ($1/M requests) | <0.01 | 0.40 |
| API Gateway WebSocket ($1/M messages + $0.25/M connection-minutes) | <0.01 | 1.15 |
| Lambda (always-free: 1M requests + 400k GB-s/mo) | 0 | 0 |
| DynamoDB on-demand (writes dominate: whole-room `PutItem`) | ~0.05 | ~8.00 |
| CloudWatch Logs (<5 GB), ≤10 alarms, Budgets, ACM | 0 | 0 |
| **Total** | **≈ $0.55** | **≈ $10** |

- If the AWS account is under 12 months old, the HTTP API (1M requests) and WebSocket (1M messages + 750k connection-minutes) free tiers make the growth column cheaper still.
- **The #1 cost lever at scale** is the room item size. Every command rewrites the whole room: undo history plus up to 500 activity entries. Moving `ActivityLog` to its own append-only items would cut write units ~5–8×, bringing the growth column to ≈ $4. Not needed at family scale; measure first (Phase 5.4).
- Domain renewal is billed separately (annual).

---

### Scaling

- **What scales by itself:**
  - Lambda: one execution environment per concurrent request.
  - API Gateway (HTTP and WebSocket).
  - DynamoDB on-demand.
  - CloudFront.
  - There is no single-instance constraint any more: connection state lives in DynamoDB, not in process memory.
- **Correctness under concurrency:** P1 makes concurrent commands on the same room safe (conditional writes + retry). P2 orders pushes by revision.
- **Quotas to know:**
  - **Lambda account concurrency:** already 1,000 on this account (checked in Phase 0).
  - **API Gateway WebSocket:** 500 new connections/s per account.
  - **API Gateway HTTP:** 10k requests/s per account.
  - All of these are far above our needs. Our own stage throttles (below) are deliberately much lower, as a cost ceiling.
- **Levers, when growing:**
  1. Raise the stage throttles (CDK context).
  2. Split `ActivityLog` out of the room item (cost).
  3. Add a scheduled warmer, SnapStart or provisioned concurrency (cold-start latency; see [lambda-hosting-plan.md](./lambda-hosting-plan.md) §8).
  4. Add WAF if abused.
  5. Add a staging stack.

---

### Phase 0: Spikes ✅ *(done 2026-10-29; results in [Appendix D](#appendix-d-spike-results))*

De-risk the three integration points that local tests can't cover. Use a throwaway `chip-tracker-spike` stack with no custom domain (the CloudFront default domain is fine), and **destroy it afterwards**. Record the findings in [Appendix D](#appendix-d-spike-results) and adjust the plans.

- **S1: CloudFront `/ws` → API Gateway WebSocket.**
  - A browser connects to `wss://<dist>.cloudfront.net/ws?room=TEST01`, and the `$connect` Lambda sees `queryStringParameters.room`.
  - A `PostToConnection` message reaches the browser.
  - A connection with a client ping every 5 min stays open for over 20 min, so CloudFront doesn't cut idle sockets earlier than API Gateway does.
  - **Fallback if it fails:** a regional custom domain `ws.<domain>` on the WebSocket API (same ACM cert with a SAN) and `VITE_WS_URL`.
- **S2: ASP.NET on Lambda cold/warm latency.** On a spike branch with [lambda-hosting-plan.md](./lambda-hosting-plan.md) steps 1, 3 and 6 applied:
  - Measure `Init Duration` + first-request duration at 512/1024/1769 MB, arm64, with and without ReadyToRun. Do the same for `WsConnect`.
  - Confirm R2R `linux-arm64` publishing works on `ubuntu-latest`.
  - **Pick the memory size.** Targets: cold < 2 s, warm p50 < 150 ms end to end.
- **S3: CloudFront `/api/*` → HTTP API.**
  - POST JSON bodies and query strings arrive intact, and `Host` is not forwarded (API Gateway rejects a foreign Host).
  - `CloudFront-Viewer-Address` arrives at the app.
  - A JSON `404` from the app passes through untouched (not rewritten to `index.html`).

---

### Phase 1: App Prerequisites *(code; see linked plans)*

1. **P1** [room-concurrency-plan.md](./room-concurrency-plan.md). Can ship on today's SignalR app.
2. **P2** [realtime-rewrite-plan.md](./realtime-rewrite-plan.md), delivery steps 1–4 (after P1).
3. **P3** [lambda-hosting-plan.md](./lambda-hosting-plan.md) (parallel with P1/P2).
4. **E2E remote target** *(done)*:
   - `tests/e2e/playwright.config.ts`: `baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000'`.
   - `global-setup.ts`/`global-teardown.ts`: skip Docker Compose when `E2E_BASE_URL` is set.
   - Docker-dependent specs (`13-reconnect`) are tagged `@local-only` and skip themselves remotely. `npm run test:remote` also excludes them with `--grep-invert @local-only`.
   - Specs use relative URLs only (`/api/...`, `/api/health`). Nothing addresses the backend on `:5000` directly.
   - **Production rate limits apply remotely** (create-room: 10/min per IP). When `E2E_BASE_URL` is set, `helpers/game.ts` `paceRoomCreation()` spaces room creations 6.5 s apart; override with `E2E_ROOM_CREATE_INTERVAL_MS`. A full remote run therefore takes ≥ ~7 min.
   - Each remote run leaves test rooms in the `Rooms` table. TTL removes them within about a day.

**Verify:**
- `dotnet test`
- frontend `npm run test` + `npm run lint`
- the full local Playwright suite
- `pwsh scripts/publish-lambdas.ps1` produces `artifacts/lambda/{api,ws-connect}`

---

### Phase 2: Rewrite the CDK Stack *(done)*

Rewrite `infra/src/stack.ts` and `infra/src/index.ts`. Keep `oidc-stack.ts`/`oidc-app.ts`. Bump `aws-cdk-lib`/`aws-cdk` minimums in `infra/package.json` to the installed 2.26x line (needed for `Runtime.DOTNET_10`).

> **As built:**
> - **Files:**
>   - `infra/src/stack.ts` is the stack.
>   - `infra/src/config.ts` reads and validates context; string `-c` overrides are JSON-parsed.
>   - `infra/src/index.ts` is the app (`chip-tracker-prod`, us-east-1).
>   - `infra/test/stack.test.ts` holds 16 Jest tests, using `tsconfig.test.json` and the jest config in `package.json`.
> - **Packages:** `aws-cdk-lib ^2.275`, `aws-cdk ^2.1146`, plus `jest`/`ts-jest`/`ts-node` dev dependencies.
> - **Removed:** `spike-app.ts` (the spike stack is destroyed).
> - **Differences from the spec below:**
>   - **Table names are CloudFormation-generated.** The app reads them from env vars, and the runbook uses the `RoomsTableName`/`ConnectionsTableName` outputs. The old fixed `chip-tracker-rooms` name was dropped, which also avoids clashes with a retained table.
>   - **The DynamoDB throttle alarm uses `ReadThrottleEvents` + `WriteThrottleEvents`** (table-level, no `Operation` dimension) summed across both tables in one metric-math alarm. That makes 5 alarms and 8 alarm metrics, inside the free 10.
>   - **The budget is account-wide**, not tag-filtered, so it works before the cost allocation tag is activated.
>   - **Logging levels stay in `appsettings.json`.** Lambda env var names can't contain `.`, so `Logging__LogLevel__Microsoft.AspNetCore` isn't settable.
> - **Verified:** `npm run build`, `npm test` (16/16), and `cdk synth -c alertEmail=…` against real `publish-lambdas.ps1` bundles. Without `alertEmail`, synth fails with a clear message.
> - **Not verified:** `cdk diff` against the account. The `tay-co` user lacks `cloudformation:DescribeStacks`, so the diff runs in Phase 4 with admin credentials.

**2.1 Configuration (CDK context in `infra/cdk.json`):**
- `domainName`: `deal-me-in.com`
- `hostedZoneId` + `hostedZoneName`: `Z0347011UK8LW7XIFFUB` + `deal-me-in.com` (use `HostedZone.fromHostedZoneAttributes`: no lookups, deterministic synth)
- `alertEmail`: **not committed** (public repo). Supplied via `-c alertEmail=...` from the GitHub variable `ALERT_EMAIL`. Synth fails with a clear message if it is missing; tests pass a dummy value.
- `monthlyBudgetUsd` (default `5`)
- `apiMemoryMb`: default `1769` (one full vCPU; chosen in S2, see Appendix D)
- `httpThrottle` (default rate `25`/burst `50`)
- `wsThrottle` (default rate `10`/burst `20`)

Stack props `apiAssetPath`/`wsConnectAssetPath` default to `../artifacts/lambda/{api,ws-connect}`; tests pass a temp directory. Drop the `env=dev|prod` switch and the `imageTag` context. The stack is always `chip-tracker-prod`.

**2.2 Remove:**
- VPC
- ECS cluster/service/task
- ALB
- NAT
- ECR repo
- autoscaling
- Container Insights
- the distribution-wide 404 → `/index.html` error response

**2.3 Data:**
- **`Rooms` table:** existing definition (PK `RoomCode`, on-demand, TTL `ExpirationTime`, `RETAIN`, PITR off).
- **`Connections` table:** PK `RoomCode` (S), SK `ConnectionId` (S), on-demand, TTL `ExpirationTime`, `DESTROY`.

**2.4 Compute:**
- **`Api` function:**
  - `Runtime.DOTNET_10`, `Architecture.ARM_64`, handler `ChipTracker.Presentation`.
  - Memory `apiMemoryMb`, timeout 15 s.
  - JSON logging, log group with 14-day retention.
  - Environment per [lambda-hosting-plan.md](./lambda-hosting-plan.md) §2.
- **`WsConnect` function:**
  - Same runtime and architecture, handler `ChipTracker.WsConnect::ChipTracker.WsConnect.Function::HandleConnectAsync`.
  - 1024 MB (S2: cold socket open ~1.1 s vs ~1.6–2.3 s at 512 MB; still inside the free tier), timeout 5 s, 14-day logs.
- **Grants:**
  - `Api`: `rooms.grantReadWriteData`, `connections.grantReadWriteData`, `webSocketApi.grantManageConnections`.
  - `WsConnect`: `rooms.grantReadData`, `connections.grantWriteData`.

**2.5 APIs:**
- **HTTP API:**
  - No CORS.
  - Route `ANY /api/{proxy+}` → `HttpLambdaIntegration(Api)` (payload 2.0).
  - `$default` stage, auto-deploy, throttle from `httpThrottle`.
    - Don't create it with `httpApi.addStage('Default', …)`. CDK treats a construct ID of `Default` like `Resource` when building logical IDs, so synth fails with *"section 'Resources' already contains 'HttpApi…'"*. Use another ID (e.g. `'DefaultStage'`) or a standalone `HttpStage`.
- **WebSocket API:**
  - `routeSelectionExpression: $request.body.action`.
  - `$connect` → `WebSocketLambdaIntegration(WsConnect)`.
  - `$default` → MOCK integration (keep-alive). It needs **both** a request template (`{"$default": "{\"statusCode\": 200}"}` with `templateSelectionExpression: "\\$default"`) **and** an `AWS::ApiGatewayV2::IntegrationResponse` (key `$default`). Without them, every ping is answered with `{"message": "Internal server error"}`; the socket stays open, but the reply is billed and pollutes the client.
    - The L2 `WebSocketMockIntegration` exposes no integration ID, so build it from L1 (`CfnIntegration` + `CfnIntegrationResponse` + `CfnRoute`), as in the spike stack.
    - Replacing an existing `$default` route in place fails (409 "route key already exists"). Get it right on first deploy, or do a two-step deploy.
  - No `$disconnect` route.
  - Stage `ws`, auto-deploy, throttle from `wsThrottle`. The stage name must equal the CloudFront path, so `/ws` maps onto it with no origin path.

**2.6 Edge:**
- **ACM certificate** for `domainName`, DNS-validated in the hosted zone.
- **Frontend bucket:** private, `BLOCK_ALL`, `enforceSSL`, versioning off, `RETAIN` off (assets are rebuilt by CI).
- **CloudFront distribution:** `domainNames: [domainName]`, `PRICE_CLASS_100`, HTTP/2+3 (WebSocket upgrades use HTTP/1.1 automatically).
  - **Default behavior:**
    - S3 OAC origin, `CACHING_OPTIMIZED`, managed `SECURITY_HEADERS` response policy.
    - A viewer-request CloudFront Function rewrites extensionless URIs to `/index.html`. This replaces the error-response hack, which turned API 404s into HTML and broke on S3's 403.
  - **`/api/*`:**
    - `HttpOrigin('{httpApiId}.execute-api.us-east-1.amazonaws.com')`, HTTPS only, `CACHING_DISABLED`, `ALLOW_ALL` methods.
    - A **custom origin request policy**: query strings all, cookies none, headers allow-list `Content-Type`, `Accept`, `Origin`, `CloudFront-Viewer-Address`. Never `Host`.
  - **`/ws`:**
    - `HttpOrigin('{wsApiId}.execute-api.us-east-1.amazonaws.com')`, HTTPS only, `CACHING_DISABLED`, GET/HEAD.
    - A **custom origin request policy**: query strings all, headers allow-list `Sec-WebSocket-Key`, `Sec-WebSocket-Version`, `Sec-WebSocket-Protocol`, `Sec-WebSocket-Accept`, `Sec-WebSocket-Extensions` (per the CloudFront WebSocket guidance).
- **Route 53:** `A` + `AAAA` alias for `domainName` → distribution.

**2.7 Guardrails & ops** (all inside free tiers):
- **SNS topic** with an email subscription to `alertEmail`.
- **Alarms** (each 5-min period, notifying SNS):
  - `Api` `Errors` ≥ 5
  - `Api` `Throttles` ≥ 1
  - HTTP API `5xx` ≥ 5
  - `WsConnect` `Errors` ≥ 5
  - DynamoDB throttle events ≥ 1 (either table; `ReadThrottleEvents` + `WriteThrottleEvents`)
- **`CfnBudget`:** `monthlyBudgetUsd`, email at 80% actual and 100% forecast.
- **Tag** every resource `app=chip-tracker` (activate it as a cost allocation tag in Phase 4).

**2.8 Outputs:**
- `SiteUrl`
- `DistributionId`
- `FrontendBucketName`
- `ApiFunctionName`
- `WsConnectFunctionName`
- `HttpApiId`
- `WebSocketApiId`
- `RoomsTableName`
- `ConnectionsTableName`

**2.9 Infra tests** (new, `aws-cdk-lib/assertions`, Jest):
- No `AWS::EC2::*`, `AWS::ECS::*`, `AWS::ElasticLoadBalancingV2::*` or `AWS::ECR::*` resources.
- Both functions are `dotnet10` + `arm64`.
- The WebSocket API has `$connect` and `$default` routes, and the stage is named `ws`.
- The `/ws` behavior's origin request policy forwards `Sec-WebSocket-Key` and `Sec-WebSocket-Version` plus all query strings.
- `/api/*` uses caching disabled and doesn't forward `Host`.
- Both stages have throttling set.
- A budget exists.

**Verify:** `npm run build && npm test && npx cdk synth` is clean, and `cdk diff` against the empty account shows the expected resource set.

---

### Phase 3: CI/CD (GitHub Actions) *(depends on 2)*

**3.1 `ci.yml` (PRs):**
- Backend `dotnet test`. Testcontainers needs Docker, which `ubuntu-latest` has.
- Frontend `npm ci`, `npm run lint`, `npm run test`, `npm run build`.
- `pwsh scripts/publish-lambdas.ps1`, then infra `npm test` + `cdk synth`.
- `cdk diff` via OIDC (the role already trusts `pull_request`).
- Optional job: the Playwright suite on Docker Compose.

**3.2 Replace `cd.yml` + `infra-cd.yml` with one `deploy.yml`.** Today both run on every push to `main` and race. `infra-cd.yml` re-bootstraps on every run, and the flow is ECS-specific.
- **Triggers:** push to `main` (`paths-ignore: planning/**, **/*.md`) and `workflow_dispatch` (input `ref`, for rollback).
- **Concurrency:** `concurrency: { group: deploy-prod, cancel-in-progress: false }`.

Jobs:
1. **`build`:**
   1. Check out `ref`.
   2. `pwsh scripts/publish-lambdas.ps1`.
   3. Frontend `npm ci && npm run test && npm run build` (`VITE_API_URL=""`).
   4. Upload `artifacts/lambda` and `src/frontend/dist`.
2. **`deploy`** (`environment: production`, OIDC):
   1. Download artifacts.
   2. `npx cdk deploy chip-tracker-prod --require-approval never -c alertEmail=${{ vars.ALERT_EMAIL }} --outputs-file cdk-outputs.json`. This deploys infra **and** both Lambda bundles.
   3. Then the frontend:
      1. `aws s3 sync dist s3://<bucket> --delete --cache-control "public,max-age=31536000,immutable" --exclude index.html`
      2. `aws s3 cp dist/index.html` with `no-cache`
      3. `aws cloudfront create-invalidation --paths /index.html` (hashed assets need no invalidation)
3. **`smoke`** (after `deploy`): `node tests/smoke/smoke.mjs https://<domain>`. A new script with no dependencies; Node 22 has a global `WebSocket`. It checks:
   - `GET /api/health` → 200.
   - `POST /api/rooms` → a room code. Join two players.
   - Open `wss://<domain>/ws?room=<code>`, `POST /start`, and receive a `gameStarted` frame within 5 s. This proves the CloudFront `/ws` path, `$connect`, the connection table and `PostToConnection`.
   - `GET /join?room=<code>` → 200 HTML (SPA deep link).
   - `GET /api/rooms/ZZZZZZ` → JSON 404.
   - Optional: a few core Playwright specs (e.g. `02-game-joining`, `06-showdown`) with `E2E_BASE_URL=https://<domain>`, via `npm run test:remote -- tests/02-game-joining.spec.ts tests/06-showdown.spec.ts`.

Within one deploy, the backend updates before the frontend. Keep API changes backward-compatible across one release (additive fields and endpoints), so tabs still on the previous SPA keep working until they reload.

**3.3 GitHub config:**
- Environment `production`.
- Secret `AWS_ROLE_TO_ASSUME`.
- Variables `AWS_REGION=us-east-1`, `SITE_DOMAIN=deal-me-in.com`, `ALERT_EMAIL=<your alert email>`.

**3.4 Optional hardening:** narrow the OIDC deploy role from `PowerUserAccess` + IAM to the following:
- `sts:AssumeRole` on the CDK bootstrap roles (`cdk-hnb659fds-*`)
- `s3:*Object`/`ListBucket` on the frontend bucket
- `cloudfront:CreateInvalidation`
- `cloudformation:DescribeStacks`

**Verify:** `actionlint` passes on all workflows, and a `workflow_dispatch` run from a branch reaches the deploy job.

---

### Phase 4: One-Time Bootstrap & First Deploy *(depends on 1–3; manual)*

The local `tay-co` IAM user cannot list CloudFormation stacks or Route 53 zones, or read Lambda/Service Quotas settings. Use the `chip-tracker` AWS CLI profile (IAM user `chip-tracker-admin`), which Phase 0 used successfully.

1. **Leftovers.** None: the old ECS stack was never deployed, and the Phase 0 `chip-tracker-spike` stack was destroyed (including its custom-resource log groups).
2. **Config.** Already known values:
   - `infra/cdk.json` context (committed): `domainName=deal-me-in.com`, `hostedZoneName=deal-me-in.com`, `hostedZoneId=Z0347011UK8LW7XIFFUB`.
   - **`alertEmail` is not committed**, because the repo is public. Store it in the GitHub variable `ALERT_EMAIL` and pass it as `-c alertEmail=$ALERT_EMAIL`. For local deploys, pass `-c alertEmail=...`, or put it in the user-level `~/.cdk.json` context, which CDK merges automatically and which lives outside the repo.
3. **Lambda concurrency quota.** ✅ Already **1,000** (checked during Phase 0). No request needed.
4. **CDK bootstrap.** The `CDKToolkit` stack already exists in us-east-1, and Phase 0 deployed with it. Re-run `cdk bootstrap aws://299983419066/us-east-1` only if `cdk deploy` reports that the bootstrap version is too old.
5. **OIDC stack.** Deploy `infra/src/oidc-app.ts` with `githubRepo=t-j-c/chip-tracker`, and put the `DeployRoleArn` output into the GitHub secret `AWS_ROLE_TO_ASSUME`. Create the environment and variables (3.3).
6. **First deploy.** Dispatch `deploy.yml` on `main`. ACM DNS validation takes ~5–30 min on first create.
7. **Confirm** the SNS subscription email. In the Billing console, activate the `app` cost allocation tag.

**Verify:**
- `https://<domain>` loads.
- Deep links like `https://<domain>/join?room=ABC123` load directly.
- An unknown room returns a JSON 404.
- The smoke job is green.

---

### Phase 5: Production Verification & Runbook *(depends on 4)*

**5.1 Functional:** two real phones on **different networks** (Wi-Fi + cellular).
- Create, QR-join, play 10+ hands, undo (approve, decline, cancel), showdown, split, rebuy.
- Lock one phone for 2 min, then unlock: it resyncs to current state.
- Leave a game idle for 15 min: still connected (keep-alive works).
- Keep one session open for over 2 h: a silent reconnect at the API Gateway cap, with no lost updates.
- Deploy mid-game: no visible disruption beyond a possible brief "Reconnecting".

**5.2 Latency:**
- After at least 1 h idle, time "Create room" from a cold start, and the first room connect.
- Warm command p50/p95 from CloudWatch: `Api` `Duration` + HTTP API `Latency`.
- Targets: cold < 2 s, warm < 150 ms. If missed, apply [lambda-hosting-plan.md](./lambda-hosting-plan.md) §8 levers in order.

**5.3 Remote e2e:** from `tests/e2e`, run `$env:E2E_BASE_URL='https://deal-me-in.com'; npm run test:remote`. It is paced for production rate limits (see Phase 1.4).

**5.4 Cost & size check after one week:**
- Cost Explorer filtered by `app=chip-tracker`.
- Average room write size: DynamoDB `ConsumedWriteCapacityUnits` ÷ number of writes. This validates the scale estimates and decides whether the `ActivityLog` split is ever worth it.

**5.5 Runbook:** add to `infra/README.md`.

| Task | How |
|---|---|
| Deploy | Merge to `main`. |
| Roll back | Dispatch `deploy.yml` with `ref=<good commit>`. It rebuilds and redeploys both Lambdas and the SPA from that commit. |
| Logs | `aws logs tail /aws/lambda/<ApiFunctionName> --follow` (likewise for `WsConnect`). |
| **Kill switch** (runaway cost or abuse) | `aws lambda put-function-concurrency --function-name <ApiFunctionName> --reserved-concurrent-executions 0`, and the same for `WsConnect`. The site shows errors and costs stop. Undo with `delete-function-concurrency`. |
| Raise limits | Edit `httpThrottle`/`wsThrottle`/`apiMemoryMb` in `cdk.json` and merge. |
| Inspect or clear a room | `aws dynamodb get-item` / `delete-item --table-name <RoomsTableName> --key '{"RoomCode":{"S":"ABC123"}}'` |
| Cost check | The Budget email, or Cost Explorer by tag `app=chip-tracker`. |

---

### Docs & Cleanup (with Phases 2–3)
- ✅ Rewrite `infra/README.md`: architecture, costs, bootstrap, runbook. *(Phase 2)*
- ✅ Update `scripts/deploy-infra.ps1`: run `publish-lambdas.ps1`, then `cdk deploy`; drop the dev/prod switch and the ECS hints. It now takes a mandatory `-AlertEmail`. *(Phase 2)*
- `scripts/docker-build.ps1`/`docker-run.ps1`: keep them for local use only, and say so in their headers.
- Root `README.md`: add a "Deployment" section linking here.
- Delete `.github/workflows/cd.yml` and `infra-cd.yml`.

---

### Accepted Risks (MVP)

- **No user auth.** The room code is a bearer secret. Anyone who has it can read the room, connect to its push channel and act as any player. Mitigated by a 36⁶ code space, crypto RNG and rate limiting. Future: a per-player secret token issued on join and required by command endpoints and `$connect`.
- **Cold starts.** Measured in S2 at 1769 MB:
  - The first API request after idle takes ~1.7 s end to end (~0.5 s init + ~0.65 s first request + network).
  - A first WebSocket connect takes ~1.1 s.
  - The warm-up ping absorbs most of the API cost (see Appendix D).
- **Push is best-effort.** A dropped `PostToConnection` is healed by the next event or the next resync (reconnect or visibility change). Revisions prevent applying stale state.
- **Rate limiting is partial.**
  - In-app per-IP limits are per Lambda environment.
  - Stage throttles are global, so a flood can cause 429s for real users. That is a DoS, but cost stays bounded.
  - No WAF. The kill switch is the last resort.
- **Direct `execute-api` access** bypasses CloudFront, and the caller can spoof `CloudFront-Viewer-Address` to dodge per-IP limits. It is still subject to the stage throttles. Future: a CloudFront custom origin header whose secret value the app checks.
- **Single region (us-east-1).** A regional outage takes the site down; room state persists.

### Excluded
- WAF, Shield Advanced, multi-region
- Staging stack (cheap now; a follow-up)
- User accounts / authentication
- SnapStart / provisioned concurrency (only if Phase 5.2 demands it)
- API Gateway custom domains (only as the S1 fallback)

---

### Appendix A: Dependency Summary

```
Phase 0 spikes ─────────────────┐
P1 room-concurrency ─► P2 realtime-rewrite ─┐
P3 lambda-hosting ──────────────────────────┼─► Phase 4 bootstrap + first deploy ─► Phase 5 verify + runbook
Phase 2 CDK (after Phase 0) ─► Phase 3 CI/CD ┘
```

### Appendix B: Status of the Previous (EC2) Revision's "App Production-Readiness" Items

Several items were implemented before the serverless pivot, as of commit `90cf21d`.

| Item | Status |
|---|---|
| Bound DynamoDB item size | **Done.** `GameRoom.MaxUndoHistory = 20` + monotonic `StateVersion`; `RoomDocumentSerializer` trims to ≤ 350 KB. |
| Write the TTL attribute | **Done.** `ExpirationTime` on every save (`DynamoDB:RoomTtlDays`, default 1); expired items are filtered on read. |
| SignalR rejoin after reconnect | **Done for SignalR**, with an infinite retry policy, visibility resync and e2e `13-reconnect`. **Superseded** by P2 (WebSocket reconnect + GET resync), which reuses `lib/reconnect.ts`. |
| Dockerfile arm64 + health check | Health check removed. arm64 image is **no longer needed** (Lambda uses zip bundles); the Dockerfile stays amd64 for local use. |
| Crypto room codes, rate limiting, forwarded headers | **Done.** The client IP source for Lambda is adjusted in P3 §4; the hub limiter is replaced in P2. |
| E2E against a remote URL | **Not done.** Now Phase 1.4. |
| Last-write-wins `PutItem` (was an accepted risk) | **Now required:** P1. |

### Appendix C: Issues in the Existing Infra

| # | Where | Issue | Resolution |
|---|---|---|---|
| 1 | `infra/src/stack.ts` | NAT gateway(s) + ALB + Fargate ≈ $60–150+/mo fixed | Removed (2.2) |
| 2 | `infra/src/stack.ts` | `/api/*` and `/hubs/*` have no origin request policy, so query strings and WebSocket headers aren't forwarded | Custom origin request policies (2.6) |
| 3 | `infra/src/stack.ts` | The distribution-wide 404 → `/index.html` (200) also rewrites API 404s. S3 + OAC returns 403 for missing keys anyway. | CloudFront Function SPA rewrite (2.6) |
| 4 | `infra/src/stack.ts` | 2 tasks with no SignalR backplane or sticky sessions | Moot: no SignalR; connection state in DynamoDB |
| 5 | `cd.yml` + `infra-cd.yml` | Both deploy on push to `main` and race. Re-bootstrap every run. ECS-specific. | Single `deploy.yml` (3.2) |

### Appendix D: Spike Results

**Run:** 2026-10-29, us-east-1, CloudFront POP JFK, client on residential IPv6.

**Setup:**
- Stack `chip-tracker-spike` from `infra/src/spike-app.ts` (since deleted). It uses the Phase 2 design: HTTP API + WebSocket API behind CloudFront with the custom origin request policies above, the real P1–P3 Lambda bundles, and S3 + the SPA rewrite function.
- Deployed in ~4 min and destroyed afterwards; total cost ≈ $0.
- `spike-app.ts` was deleted in Phase 2. Its settings, including the MOCK keep-alive fix, live on in `infra/src/stack.ts`.

**S1: CloudFront `/ws` → API Gateway WebSocket. ✅ PASS (no fallback needed)**

| Check | Result |
|---|---|
| `$connect` receives `?room=` through CloudFront | ✅ `bad` → 400, `ZZZZZZ` → 404 (handshake rejected); valid room → 101 |
| Socket open time (warm) | ~100–170 ms |
| `PostToConnection` delivery | ✅ `playerJoined`, `gameStarted` and `gameStateUpdated` arrive on all sockets with the full envelope (`type, roomCode, revision, actorPlayerId, roomInfo, gameState`), ~2 KB each |
| Idle, no pings | Closed at **10.0 min** (code 1006). That is API Gateway's idle timeout, so CloudFront does not cut earlier. |
| Idle, ping every 5 min | ✅ Still open at **22 min** and received a push. |
| Stale connection cleanup | ✅ The push to the dead socket got `410 Gone`, and its row was deleted from `Connections`. |
| Keep-alive `$default` MOCK | ⚠️ Fixed during the spike: it needs a request template **and** an integration response (see 2.5). |
| Lambda errors/warnings in logs | None |

**S2: Lambda latency (arm64, .NET 10).** Cold = env var changed to force a fresh environment; first request = `GET /api/rooms/{code}` (MediatR + DynamoDB read). Three samples each.

| Function / memory | Init | First request | Cold e2e via CloudFront | Warm duration | Warm e2e p50 / max |
|---|---|---|---|---|---|
| Api R2R 512 MB | ~500 ms | ~2,050 ms | 3,040 ms | 6–43 ms | 90 / 359 ms |
| Api R2R 1024 MB | ~500 ms | ~1,030 ms | 2,095 ms | 6–28 ms | 94 / 182 ms |
| **Api R2R 1769 MB** ✔ | ~505 ms | ~650 ms | **1,666 ms** | 6–22 ms | **94 / 151 ms** |
| Api *no* R2R 1769 MB | ~550 ms | ~765 ms | — | 5–25 ms | — |
| WsConnect 512 MB | ~320 ms (one 660) | ~1,020 ms | open 1.6–2.3 s | — | open ~165 ms |
| **WsConnect 1024 MB** ✔ | ~300 ms | ~500 ms | open **1.1–1.2 s** | — | open ~160 ms |

- **Warm commands:** `POST /actions` (load, conditional save, fan-out to 2 sockets) runs p50 **141 ms** / p95 187 ms end to end. Both sockets receive the push before the HTTP response returns (p50 134 ms). ✅ Meets the < 150 ms target.
- **Decisions:**
  - `apiMemoryMb = 1769`: the only size meeting cold < 2 s. Max memory used is only ~120 MB, so CPU is what matters.
  - `WsConnect = 1024 MB`.
  - Both remain far inside the free tier: 1,000 games/mo ≈ 400k requests × ~30 ms × 1.73 GB ≈ 21k GB-s, against 400k free.
- **ReadyToRun** saves ~150 ms per cold start (≈ 12%). Keep it.
  - It cross-compiles to `linux-arm64` on Linux x64 (verified in the `mcr.microsoft.com/dotnet/sdk:10.0` container, the `ubuntu-latest` equivalent).
  - Bundles: Api 7.5 MB, WsConnect 7.2 MB (non-R2R Api: 3.0 MB).
- **Warm-up effectiveness:** a cold `GET /api/health` (init ~440 ms + 175–260 ms) absorbs most of the cost. The *first* DynamoDB-backed request afterwards still takes **~290–420 ms** (SDK credential/TLS/first-call setup) versus ~10 ms after. **Follow-up:** prime the DynamoDB client during warm-up ([lambda-hosting-plan.md](./lambda-hosting-plan.md) §5).

**S3: CloudFront `/api/*` → HTTP API. ✅ PASS**

| Check | Result |
|---|---|
| POST JSON body | ✅ Arrives intact |
| Query string (incl. `%20`) | ✅ Arrives intact |
| `Host` at the origin | ✅ `{apiId}.execute-api…` (viewer Host not forwarded) |
| `CloudFront-Viewer-Address` | ✅ Present, as `ip:port`, including **IPv6** (`2603:…:6c4c:57427`). Parse on the **last** `:`, as implemented. |
| `X-Forwarded-For` | `viewer, cloudfront-edge`. HTTP API `sourceIp` = viewer. |
| `User-Agent` | Replaced with `Amazon CloudFront` (not in allow-list; fine) |
| App JSON 404 (`/api/rooms/ZZZZZZ`) | ✅ Passes through as `application/json` 404 |
| SPA deep link (`/join?room=…`) | ✅ 200 `index.html` via the CloudFront Function |
| Missing hashed asset (`/assets/nope.js`) | 403 from S3 (OAC without `s3:ListBucket`). Acceptable: only stale tabs hit this, and they reload. |
| Direct `execute-api` URL | Reachable (200), as already accepted in Accepted Risks |
