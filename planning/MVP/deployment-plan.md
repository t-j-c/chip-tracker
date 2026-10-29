## Plan: Chip Tracker Public Deployment (Low-Cost AWS)

Take the working MVP from local Docker Compose to a public HTTPS site on our Route 53 domain for about **$8/month**, with push-to-deploy from `main`.

This plan **supersedes Phase 8 (CDK) and Phase 9 (CI/CD) of [detailed-design.md](./detailed-design.md)**. The ECS Fargate + ALB + NAT design built there costs about $60–80/mo for dev and $150+/mo for prod. It also has several functional bugs (see [Appendix B](#appendix-b-issues-found-in-the-existing-infra--app)).

---

### Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Hosting | **AWS: one EC2 `t4g.nano` (Graviton/arm64) running the backend container, behind CloudFront** | Cheapest AWS option that supports SignalR WebSockets, an IAM instance profile (no static keys), SSM-based deploys (no SSH), and stays in CDK. |
| Frontend | **S3 (private, OAC) + CloudFront** | Effectively free at our traffic. Same origin as the API, so `VITE_API_URL=""` and no CORS complexity. |
| Persistence | **DynamoDB on-demand (existing table design)** | Already implemented. Costs pennies. Free storage tier. |
| Domain / TLS | **Existing Route 53 domain + free ACM certificate** on CloudFront | Hosted zone already exists from registration. |
| Environments | **Single `prod` stack.** Local Docker Compose is "dev". | A second stack would double the fixed cost. |
| Scale | **Exactly 1 backend instance** | SignalR groups are in-memory. Scaling out needs a backplane or sticky sessions (out of scope). |
| Region | **us-east-1** | The CloudFront ACM cert must live in us-east-1, so keeping everything there gives a single stack. |

#### Alternatives considered

| Option | Est. $/mo | Why not |
|---|---|---|
| Existing ECS Fargate + ALB + NAT | 60–150+ | ALB (~$16) and NAT (~$32) fixed costs dominate. Overkill for a 2-player app. |
| AWS App Runner | — | Closed to new customers (AWS now recommends ECS Express Mode). Never supported WebSockets anyway. |
| ECS Fargate with public IP, no ALB | ~11 | The task IP changes on every restart, so there is no stable CloudFront origin. Costs more than EC2. |
| Lambda + API Gateway WebSockets | ~0–1 | Requires rewriting SignalR to raw API GW WebSockets plus connection tracking in DynamoDB. Large rewrite. |
| Lightsail $5 VM | ~5–6 | No IAM instance profile (static keys on the box). L1-only CDK support. No native SSM deploy path. |
| Fly.io / Google Cloud Run | ~0–4 | Second vendor. Static AWS keys for DynamoDB (or a repo rewrite). Cold starts. Cloud Run caps WebSockets at 60 min. |

---

### Target Architecture

```
                         Route 53:  <domain>  A/AAAA alias ─┐
                                    origin.<domain>  A ──────┼──────────────┐
                                                             ▼              │
 Browser ──HTTPS/WSS──► CloudFront (ACM cert, PriceClass_100) │              │
                         ├─ default (*)  → S3 bucket (OAC)    │              │
                         │     viewer-request CloudFront Function: SPA       │
                         │     rewrite (no file extension → /index.html)     │
                         ├─ /api/*   → custom origin  http://origin.<domain>:80
                         └─ /hubs/*  → custom origin  (WebSocket upgrade)    │
                                     no cache, forward all viewer headers,   │
                                     query strings, cookies                  ▼
            ┌──────────── VPC (1 AZ, public subnet only, NO NAT) ────────────────┐
            │  EC2 t4g.nano, Amazon Linux 2023 arm64, Elastic IP                 │
            │   SG: tcp/80 from CloudFront origin-facing prefix list ONLY;       │
            │       no SSH (shell via SSM Session Manager); IMDSv2 required      │
            │   docker: chip-tracker-backend  (-p 80:5000, --restart always)     │
            │   logs  → CloudWatch Logs (awslogs driver, 14-day retention)       │
            │   role  → DynamoDB RW (table only), ECR pull, SSM core, logs       │
            └────────────────────────────────────────────────────────────────────┘
                         DynamoDB  chip-tracker-rooms  (on-demand, TTL)
                         ECR       chip-tracker/backend (keep last 10 images)
                         SSM Param /chip-tracker/backend/image-tag (current release)
```

**Why a Route 53 `origin.<domain>` record:** CloudFront custom origins need a hostname, not an IP. An A record pointing at the Elastic IP gives a stable origin hostname that survives instance replacement.

---

### Estimated Monthly Cost (us-east-1, on-demand)

Approximate figures. Re-check in the AWS Pricing Calculator before go-live.

| Item | $/mo |
|---|---|
| EC2 `t4g.nano` (0.5 GB RAM, 2 vCPU burstable, **standard** credits) | ~3.07 |
| Public IPv4 address (Elastic IP, billed even when attached) | ~3.65 |
| EBS gp3 8 GB root volume | ~0.64 |
| Route 53 hosted zone (already incurred by the domain) | 0.50 |
| CloudFront (always-free tier: 1 TB egress, 10M requests, 2M function invocations) | 0 |
| S3 (<100 MB of static assets) | <0.05 |
| DynamoDB on-demand (+ 25 GB free storage) | <0.10 |
| ECR (~10 arm64 images × ~100 MB) | ~0.10 |
| ACM, SSM Run Command, SSM standard params, CloudWatch Logs (<5 GB), ≤10 alarms, Budgets | 0 |
| **Total** | **≈ $8** |

Cost levers, if needed later:
- **`t4g.micro` (1 GB):** +$3/mo if memory is tight (a one-line context change).
- **1-yr Savings Plan / RI on the instance:** roughly 30–40% off compute.
- **IPv6-only origin:** saves $3.65/mo. Only do this after confirming CloudFront IPv6 origins plus dual-stack endpoints for DynamoDB, ECR and SSM in us-east-1.

Domain renewal is billed separately (annual).

---

### Phase 1: App Production-Readiness *(no deps; parallel with Phase 2)*

These are blocking bugs or risks that only show up once the app runs on the public internet, on phones, for whole evenings.

**1.1 Bound the DynamoDB item size (BLOCKER).**
- **Problem.** `GameRoom.StateHistory` grows without limit. The whole room (history plus a 500-entry `ActivityLog`) is stored as **one** DynamoDB item, and items are capped at **400 KB**. Rough estimate: ~1 KB per `GameState` × ~10–15 states per hand, plus ~125 KB of activity log, means `SaveAsync` starts throwing after about **25 hands**.
- **Fix.** Cap `StateHistory` to the most recent N states (e.g. 20; undo only needs the tail).
- **Required follow-on.** Replace the `StateHistory.Count`-based activity `StateVersion` with a monotonic `StateVersion` counter on `GameRoom`. Otherwise the undo strike-through logic in `UndoLastAction()` marks the wrong entries once history is trimmed. Persist the counter, and treat a missing value as `StateHistory.Count` for rooms already stored.
- **Test.** Simulate 300 hands and assert that the serialized room is under 350 KB. Also cover undo and strike-through after trimming.

**1.2 Write the DynamoDB TTL attribute.**
- The CDK table enables TTL on `ExpirationTime`, but `DynamoDbRoomRepository` never writes it, so rooms never expire.
- Set `ExpirationTime` (epoch seconds) to `LastUpdatedAt + 30 days` on every save. Make the window configurable via `DynamoDB:RoomTtlDays`.

**1.3 Rejoin the SignalR group after reconnect (BLOCKER).**
- **Problem.** In `useSignalR.ts`, `onreconnected` only flips `isConnected`. The reconnected socket has a **new connection ID** that is not in the room group, so the client silently stops receiving `GameStateUpdated`. Phone sleep/wake, Wi-Fi↔cellular switches and every backend deploy trigger this.
- **Fix.** In `onreconnected`, re-invoke `JoinRoom(roomCode, playerId)`, which also re-sends the current state.
- **Fix.** Replace the default `withAutomaticReconnect()` policy, which gives up after about 42 s. Use a policy that keeps retrying with backoff capped at ~10 s.
- **Fix.** Handle `onclose` with a manual restart and rejoin.

**1.4 Make the Dockerfile arm64-ready and fix the health check.**
- Build stage: `FROM --platform=$BUILDPLATFORM ...sdk:10.0` and `dotnet publish -a $TARGETARCH`. This cross-compiles on amd64 CI runners with no QEMU.
- Remove `HEALTHCHECK ... curl`. The `aspnet` runtime image has no `curl`, so the container always reports unhealthy. The host-side deploy script does the health check instead.
- Optional: switch the runtime image to `aspnet:10.0-noble-chiseled` (about half the size, non-root).

**1.5 Harden for public exposure (cheap, in-app; no paid WAF).**
- Generate room codes with `RandomNumberGenerator.GetInt32`, not `System.Random`. Codes are now the only access control.
- Add the built-in `Microsoft.AspNetCore.RateLimiting` middleware with per-client-IP limits. For example: `POST /api/rooms` 10/min, `POST /api/rooms/{code}/join` 20/min, `GET /api/rooms/*` 60/min.
- `UseForwardedHeaders` (X-Forwarded-For, ForwardLimit = 1) so the rate limiter sees the real client IP from CloudFront.
- `appsettings.json` production logging at `Information`, with Microsoft.* at `Warning`, to keep CloudWatch ingest in the free tier.

**1.6 Make the e2e suite target a remote URL.**
- `playwright.config.ts`: `baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000'`.
- `global-setup.ts` / `global-teardown.ts`: skip Docker Compose when `E2E_BASE_URL` is set.

**Verify:** `dotnet test`, frontend `npm run test` and `npm run lint`, and the full local Playwright suite (including a new test: kill and restore the backend mid-hand, and both clients resume receiving updates). `docker buildx build --platform linux/arm64 src/backend` succeeds.

---

### Phase 2: Rewrite CDK Stack *(no deps; parallel with Phase 1)*

Rewrite `infra/src/stack.ts` and `infra/src/index.ts`. Keep `oidc-stack.ts` as is.

**2.1 Configuration (CDK context, committed in `cdk.json`):**
- `domainName`: e.g. `chiptracker.example.com` or the apex.
- `hostedZoneId` and `hostedZoneName`: use `HostedZone.fromHostedZoneAttributes`, so there is no lookup and synth stays deterministic.
- `instanceType`: default `t4g.nano`.
- `alertEmail`: for the budget and alarms.
- Drop the `env=dev|prod` switch and `imageTag` context. The stack is always `chip-tracker-prod`, and the image tag is no longer an infra concern (see 3.2).

**2.2 Remove:** ECS cluster, service and task definition; ALB and target group; NAT gateways; Container Insights; autoscaling; the 404→`/index.html` distribution-wide error response.

**2.3 Keep or adjust:**
- DynamoDB table: unchanged (RETAIN, TTL `ExpirationTime`, PITR off).
- ECR repo `chip-tracker/backend`: add a lifecycle rule (keep last 10).
- Frontend bucket: turn versioning off, or add a 7-day noncurrent-version expiry.

**2.4 Add networking and compute:**
- `ec2.Vpc` with `maxAzs: 1`, `natGateways: 0`, and a single PUBLIC subnet.
- `ec2.Instance` with:
  - AL2023 arm64 AMI and `t4g.nano`
  - standard CPU credits (caps cost; the app is mostly idle)
  - IMDSv2 required
  - 8 GB gp3, encrypted
  - `userDataCausesReplacement: true`
- `CfnEIP` + association.
- Security group: ingress tcp/80 from the managed prefix list `com.amazonaws.global.cloudfront.origin-facing` only. No port 22.
- Instance role:
  - `AmazonSSMManagedInstanceCore`
  - `table.grantReadWriteData`
  - `ecrRepo.grantPull`
  - write to the backend log group
  - `ssm:GetParameter` on the image-tag parameter

**2.5 Instance user data (idempotent bootstrap):**
1. Install and enable Docker. Create a 1 GB swap file (headroom on 0.5 GB).
2. Write `/opt/chip-tracker/app.env`. This holds only non-secret config:
   - `ASPNETCORE_ENVIRONMENT=Production`
   - `ASPNETCORE_URLS=http://+:5000`
   - `AWS_REGION`
   - `DynamoDB__TableName`
   - `Cors__AllowedOrigins__0=https://<domain>`
   - `DOTNET_gcServer=0`
   - `DOTNET_GCConserveMemory=5`
3. Write `/opt/chip-tracker/deploy.sh <tag>`:
   1. ECR login, then `docker pull`.
   2. Remember the currently running tag.
   3. `docker rm -f app`, then `docker run -d --name app --restart always -p 80:5000 --env-file app.env --log-driver awslogs ...`.
   4. Poll `curl -fsS localhost/health` for up to 60 s. If it never succeeds, redeploy the previous tag and `exit 1`.
   5. On success, `docker image prune`.
4. Read SSM param `/chip-tracker/backend/image-tag`. If it is set, run `deploy.sh` with it, so a replaced instance comes back on the current release with no CI run.

**2.6 Edge:**
- ACM certificate for `domainName`, DNS-validated in the hosted zone.
- CloudFront distribution: `domainNames: [domainName]`, `priceClass: PRICE_CLASS_100`, HTTP/2+3.
  - **Default behavior:** S3 OAC origin, `CACHING_OPTIMIZED`, plus a CloudFront Function (viewer-request) that rewrites extensionless paths to `/index.html`. This replaces the error-response hack, which would have turned API 404s into `200 index.html` and broken on S3's 403 for missing keys.
  - **`/api/*` and `/hubs/*`:** `HttpOrigin('origin.<domain>', { protocolPolicy: HTTP_ONLY })`, `CACHING_DISABLED`, **`OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER`** (forwards query strings and `Sec-WebSocket-*` headers; required for SignalR negotiate and connect), and `AllowedMethods.ALLOW_ALL`.
- Route 53:
  - `A` + `AAAA` alias for `domainName` → distribution
  - `A` record `origin.<domainName>` → Elastic IP (TTL 300)

**2.7 Ops (all free tier):**
- Log group `/chip-tracker/backend`, 14-day retention.
- Alarm `StatusCheckFailed_System` → EC2 recover action.
- Alarm `StatusCheckFailed_Instance` → reboot action. SNS email to `alertEmail`.
- `CfnBudget`: $15/mo cost budget with email at 80% actual and 100% forecast.
- SSM `StringParameter` `/chip-tracker/backend/image-tag`, initial value `none`. CI owns the value after creation, so it must not be overwritten on stack updates.

**2.8 Outputs:** `SiteUrl`, `DistributionId`, `FrontendBucketName`, `InstanceId`, `BackendEcrUri`, `DynamoDBTableName`.

**2.9 Infra tests (new, `aws-cdk-lib/assertions`):** assert that the template has:
- no `AWS::EC2::NatGateway`
- no `AWS::ElasticLoadBalancingV2::LoadBalancer`
- an SG with no 0.0.0.0/0 ingress
- `/hubs/*` uses an origin request policy that forwards query strings

**Verify:** `npm run build && npx cdk synth` is clean, infra tests pass, and `cdk diff` shows the expected resource set.

---

### Phase 3: CI/CD (GitHub Actions) *(depends on 2)*

**3.1 `ci.yml` (PRs):**
- Existing backend test and frontend lint/build, plus frontend `npm run test`.
- Infra: `npm test` (assertions) + `cdk synth` + `cdk diff` (OIDC role already trusts `pull_request`).
- Optional: the Playwright suite against Docker Compose.

**3.2 Replace `cd.yml` + `infra-cd.yml` with one `deploy.yml`.**
Today both run on every push to `main` and race each other. `infra-cd.yml` also re-bootstraps on every run and has a dead "comment on PR" step. The new workflow runs on push to `main` plus `workflow_dispatch` (input `ref` for rollback).

Jobs:
1. **`changes`:** `dorny/paths-filter`, which outputs `infra`, `backend`, `frontend`.
2. **`infra`** (if infra changed; `environment: production`): `cdk deploy chip-tracker-prod --require-approval never`.
3. **`backend`** (needs `infra` success or skipped; if backend changed or dispatch):
   1. `docker/build-push-action`, `platforms: linux/arm64`, tag `${{ github.sha }}` → ECR.
   2. `aws ssm send-command --instance-ids <InstanceId> --document-name AWS-RunShellScript --parameters commands="/opt/chip-tracker/deploy.sh <sha>"`.
   3. Poll `get-command-invocation` until it finishes. Fail the job on a non-zero exit.
   4. On success: `aws ssm put-parameter /chip-tracker/backend/image-tag <sha> --overwrite`.
4. **`frontend`** (needs `backend` success or skipped; if frontend changed or dispatch):
   1. `npm ci && npm run build` (`VITE_API_URL=""`).
   2. `aws s3 sync dist s3://<bucket> --delete --cache-control "public,max-age=31536000,immutable" --exclude index.html`.
   3. `aws s3 cp index.html` with `no-cache`.
   4. Invalidate `/index.html` only (hashed assets don't need it).
5. **`smoke`** (always after deploy jobs):
   - `curl -fsS https://<domain>/health`
   - `curl -fsS -X POST "https://<domain>/hubs/game/negotiate?negotiateVersion=1"`. This proves CloudFront forwards SignalR correctly.
   - Optional: Playwright `game-flow` with `E2E_BASE_URL=https://<domain>`.

Read stack outputs once (`describe-stacks`) in each job that needs them. Keep `concurrency: { group: deploy-prod, cancel-in-progress: false }`.

**3.3 GitHub config:**
- Environment `production`.
- Secret `AWS_ROLE_TO_ASSUME`.
- Variables `AWS_REGION=us-east-1`, `SITE_DOMAIN`.

**Verify:** `actionlint` passes on all workflows. A dry run on a branch with `workflow_dispatch` reaches the deploy steps.

---

### Phase 4: One-Time Bootstrap & First Deploy *(depends on 1–3; manual)*

The local `tay-co` IAM user cannot currently list CloudFormation stacks or Route 53 zones. Use an admin or SSO profile for steps 1–4.

1. **Check for leftovers.** Confirm no old `chip-tracker-dev` or `chip-tracker-prod` stacks exist. If either does, `cdk destroy` it first: the NAT gateway alone is about $32/mo. Note that the old DynamoDB table and ECR repo are `RETAIN`/named and will collide with the new stack. Delete or import them.
2. **Confirm the Route 53 hosted zone.** Record `hostedZoneId` and `hostedZoneName`, and put them plus `domainName` and `alertEmail` into `infra/cdk.json` context.
3. `cdk bootstrap aws://<account>/us-east-1`.
4. **Deploy the OIDC stack** (`infra/src/oidc-app.ts`, `githubRepo=t-j-c/chip-tracker`). Copy the `DeployRoleArn` output into the GitHub secret `AWS_ROLE_TO_ASSUME`.
5. **First infra deploy:** `cdk deploy chip-tracker-prod` (locally or via `deploy.yml` dispatch). The ACM DNS validation step takes about 5–30 min.
6. **First app deploy:** dispatch `deploy.yml` on `main` and confirm the smoke job passes.
7. **Confirm SNS subscription** emails for alarms and the budget.

**Verify:** `https://<domain>` loads the SPA. Deep links like `https://<domain>/join?room=ABC123` load directly (no 403). An unknown room returns a JSON 404, not HTML.

---

### Phase 5: Production Verification & Runbook *(depends on 4)*

**5.1 Functional:** two real phones on **different networks** (Wi-Fi + cellular).
- Create, QR-join, play 10+ hands, undo, showdown, split.
- Lock one phone for 2 min, then unlock: the client resumes with current state (validates 1.3).
- Deploy mid-game: both clients recover within about 15 s.
- Run the remote Playwright suite against prod.

**5.2 Capacity check on `t4g.nano`:**
- Use SSM Session Manager to run `free -m` and `docker stats` during 2 concurrent games.
- If steady-state used RAM is above ~400 MB, or swap use keeps climbing, change the `instanceType` context to `t4g.micro` and redeploy.
- Check the `CPUCreditBalance` metric after a week.

**5.3 Long game:** run a 100+ hand scripted game (Playwright or an API script) and confirm no DynamoDB `ValidationException` (item size). This validates 1.1.

**5.4 Runbook:** add these to `infra/README.md`.

| Task | How |
|---|---|
| Deploy | Merge to `main`. |
| Roll back app | Dispatch `deploy.yml` with `ref=<good commit>`. Rebuilds and redeploys the backend and frontend from that commit. Backend-only quick path: SSM `deploy.sh <previous sha>`. |
| Shell on box | `aws ssm start-session --target <InstanceId>` |
| Logs | `aws logs tail /chip-tracker/backend --follow` |
| Restart | `aws ec2 reboot-instances --instance-ids <InstanceId>`. The container restarts automatically (`--restart always`). |
| Replace instance | Change user data or the instance type, then `cdk deploy`. The new instance self-deploys from the SSM image-tag param. Expect about 2–4 min of downtime; game state persists in DynamoDB. |
| Cost check | AWS Budgets email, or Cost Explorer filtered by tag `app=chip-tracker`. |

---

### Docs & Cleanup (with Phases 2–3)
- Rewrite `infra/README.md` (architecture, costs, bootstrap, runbook) to match this plan.
- Update `scripts/deploy-infra.ps1`: drop the dev/prod switch and the ECS hints.
- Root `README.md`: add a "Deployment" section linking here.

---

### Accepted Risks (MVP)
- **No user auth.** The room code is a bearer secret. Anyone who has it can read player IDs from `GET /api/rooms/{code}` and act as either player. Mitigated by a 36⁶ code space, crypto RNG and rate limiting. Future: a per-player secret token issued on join and required by hub methods.
- **Single instance, single AZ.** An AZ or host failure means minutes of downtime (auto-recover alarm). No in-flight state is lost: it is all in DynamoDB.
- **Deploys cause about 5–15 s of disconnect.** Clients auto-reconnect (1.3). Avoid deploying during known game nights.
- **CloudFront → origin traffic is HTTP.** It crosses the public internet unencrypted (game state only, no PII or credentials). The origin accepts traffic only from CloudFront IP ranges. Future: TLS on the origin (Caddy + ACME) if needed.
- **Last-write-wins `PutItem`.** There is no optimistic concurrency on room saves, which is a pre-existing issue. Low risk with one instance and turn-based play. Future: a version attribute + `ConditionExpression`.

### Excluded
- Multi-instance scale-out (Redis or Azure SignalR backplane, sticky sessions)
- WAF (≥ $5/mo), Shield Advanced, multi-region
- Separate dev/staging stack
- User accounts / authentication

---

### Appendix A: Phase Dependency Summary

```
Phase 1 (app readiness) ─┐
                         ├─► Phase 4 (bootstrap + first deploy) ─► Phase 5 (verify, runbook)
Phase 2 (CDK rewrite) ───┤
        └─► Phase 3 (CI/CD) ┘
```

### Appendix B: Issues Found in the Existing Infra & App

| # | Where | Issue | Addressed in |
|---|---|---|---|
| 1 | `infra/src/stack.ts` | NAT gateway(s) + ALB + Fargate ≈ $60–150+/mo fixed | 2.2 |
| 2 | `infra/src/stack.ts` | `/hubs/*` and `/api/*` have no origin request policy, so query strings (`negotiateVersion`, `id`, `limit`/`offset`) and WebSocket headers aren't forwarded. SignalR can't connect through CloudFront. | 2.6 |
| 3 | `infra/src/stack.ts` | The distribution-wide 404→`/index.html` (200) also rewrites API 404s. S3+OAC returns **403** for missing keys, so SPA deep links break anyway. | 2.6 |
| 4 | `infra/src/stack.ts` | Prod runs 2 tasks with no sticky sessions or SignalR backplane, so group broadcasts miss clients on the other task. | Decisions (1 instance) |
| 5 | `GameRoom.cs` / `DynamoDbRoomRepository.cs` | `StateHistory` is unbounded inside a single 400 KB DynamoDB item. | 1.1 |
| 6 | `DynamoDbRoomRepository.cs` | TTL attribute `ExpirationTime` is never written. | 1.2 |
| 7 | `useSignalR.ts` | No `JoinRoom` after auto-reconnect. The reconnect policy gives up after about 42 s. | 1.3 |
| 8 | `src/backend/Dockerfile` | `HEALTHCHECK` uses `curl`, which isn't in the `aspnet` image. Builds amd64 only. | 1.4 |
| 9 | `CreateRoomCommandHandler.cs` | Room codes come from `System.Random`, which is not cryptographically secure. | 1.5 |
| 10 | `.github/workflows/cd.yml` + `infra-cd.yml` | Both deploy on push to `main` and race. `infra-cd` re-bootstraps every run. The CD flow is ECS-specific. | 3.2 |
