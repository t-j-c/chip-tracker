## Plan: Run the Backend on AWS Lambda (Serverless Prerequisite 3)

Run the **same** ASP.NET Core app under Kestrel locally (docker compose, e2e, tests) and on Lambda behind an API Gateway HTTP API in prod, with no code fork. Also produce the deployable Lambda artifacts.

- **Depends on:** nothing. It can run in parallel with [room-concurrency-plan.md](./room-concurrency-plan.md) and [realtime-rewrite-plan.md](./realtime-rewrite-plan.md).
- **Consumed by:** [deployment-plan.md](./deployment-plan.md) Phases 2–3.
- **Validated by:** spike S2 (cold start) in the deployment plan's Phase 0.

---

### Steps

**1. Hosting adapter**
- Add `Amazon.Lambda.AspNetCoreServer.Hosting` to `ChipTracker.Presentation`.
- Call `builder.Services.AddAWSLambdaHosting(LambdaEventSource.HttpApi)` (payload format 2.0).
  - It does nothing unless `AWS_LAMBDA_FUNCTION_NAME` is set, so Kestrel, docker compose and `WebApplicationFactory` tests are unaffected.
- The Lambda handler string is the assembly name: `ChipTracker.Presentation`.
- The routes need no change. CloudFront forwards `/api/*` unchanged to the HTTP API `$default` stage, so ASP.NET sees `/api/rooms/...` exactly as today.

**2. Configuration from environment variables** (set by CDK, no secrets):

| Variable | Value |
|---|---|
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `DynamoDB__TableName` | rooms table name |
| `DynamoDB__ConnectionsTableName` | connections table name |
| `DynamoDB__RoomTtlDays` | `1` |
| `Realtime__Mode` | `ApiGateway` |
| `Realtime__ManagementEndpoint` | `https://{wsApiId}.execute-api.{region}.amazonaws.com/ws` |
| `RateLimiting__ClientIpSource` | `CloudFrontViewerAddress` (see step 4) |
| `Logging__LogLevel__Default` / `__Microsoft` | `Information` / `Warning` |

- AWS SDK clients use the function's execution role (`AmazonDynamoDBClient()` with no args already does).
- CORS stays configured but is irrelevant in prod: the SPA and API share an origin.

**3. Cold-start and per-request trimming**
- **DynamoDB `Table` handle:**
  - Today `DynamoDbRoomRepository` is scoped and calls `Table.LoadTable` lazily. That is a `DescribeTable` round trip **on every request**.
  - Build the `ITable` once as a singleton via `TableBuilder` with the known key schema (`RoomCode` hash key). This removes the per-request call and the cold-start call.
  - Do the same for the connections table.
- **Publish settings** (Presentation and `ChipTracker.WsConnect` csproj, applied only in the Lambda publish profile):
  - `PublishReadyToRun=true` (precompiled IL, the biggest cold-start win).
  - `InvariantGlobalization=true`. Confirm no culture-sensitive server-side formatting; chip formatting happens in the browser.
  - `TieredPGO` left at the default.
- `DynamoDbTableInitializer` is only registered for local DynamoDB. Confirm it never runs on Lambda.
- Native AOT is **not** in scope: MediatR's reflection-based registration and the non-source-generated JSON would need rework. Revisit only if spike S2 shows unacceptable cold starts *and* the cheaper levers (§8) don't help.

**4. Client IP for in-app rate limiting**
- Behind CloudFront → HTTP API, `RemoteIpAddress` is a CloudFront edge IP, and `X-Forwarded-For` is a chain, so `ForwardLimit = 1` would pick the wrong hop.
- Add `RateLimiting:ClientIpSource`:
  - **`ForwardedFor`** (default; local nginx): today's `UseForwardedHeaders` behavior.
  - **`CloudFrontViewerAddress`** (Lambda): a tiny middleware, registered before `UseRateLimiter`, that parses the `CloudFront-Viewer-Address` header (`ip:port`; split on the **last** `:` for IPv6) into `HttpContext.Connection.RemoteIpAddress`. If the header is missing, it keeps the source IP. CloudFront adds this header only when the origin request policy lists it (deployment plan 2.6).
- In-app limiters are **per execution environment**: each warm Lambda keeps its own counters. Treat them as best-effort per-IP fairness. The hard global cap is API Gateway stage throttling, and the budget alarm is the cost backstop (deployment plan 2.5/2.7).

**5. Health and warm-up**
- Add `GET /api/health` → `200 "healthy"`. CloudFront only routes `/api/*` to the backend. Keep `/health` for docker compose.
- The frontend sends a fire-and-forget `fetch('/api/health')` when the app loads (the landing, create and join pages). The API Lambda is then usually warm before the first real request (create room / join).
- **Follow-up from spike S2 (not yet implemented):**
  - Problem: the warm-up absorbs init, but the first DynamoDB-backed request afterwards still costs ~290–420 ms (SDK credential/TLS/first-call setup), versus ~10 ms once primed.
  - Fix: when running on Lambda (`AWS_LAMBDA_FUNCTION_NAME` set), have `/api/health` also prime the DynamoDB client before returning, e.g. `IRoomRepository.ExistsAsync("WARMUP")`. That is a single consistent `GetItem` on a nonexistent key, costing ~0.5 RRU (fractions of a cent per month).
  - Keep `/health` (docker) free of the DynamoDB call.
  - Optionally do the same in `WsConnect`'s constructor, which runs during init with boosted CPU.

**6. Packaging**
- New `scripts/publish-lambdas.ps1` (PowerShell 7; runs on Windows dev boxes and `ubuntu-latest` runners):
  ```
  dotnet publish src/backend/src/ChipTracker.Presentation -c Release -r linux-arm64 --self-contained false -p:PublishReadyToRun=true -o artifacts/lambda/api
  dotnet publish src/backend/src/ChipTracker.WsConnect     -c Release -r linux-arm64 --self-contained false -p:PublishReadyToRun=true -o artifacts/lambda/ws-connect
  ```
- CDK consumes these folders with `lambda.Code.fromAsset(...)`. CDK zips and uploads them, so the backend code deploys **as part of `cdk deploy`**. There is no ECR and no Docker in the deploy path.
- Add `artifacts/` to `.gitignore`.
- ReadyToRun cross-compiles to `linux-arm64` from x64 hosts (crossgen2). Spike S2 confirms this on the CI runner.
- `src/backend/Dockerfile` and docker compose stay as they are for local dev and e2e.

**7. Logging**
- Use Lambda's JSON log format (`loggingFormat: JSON`, application log level `INFO`, system log level `WARN`), so CloudWatch Logs Insights can query fields.
- Keep the production log level at Information for app categories and Warning for `Microsoft.*`. Ingest stays well inside the 5 GB/mo free tier.

**8. Cold-start levers (only if spike S2 or real use shows a need), cheapest first**

*S2 outcome (deployment-plan Appendix D):*
- Levers 1 and 2 are applied: R2R + `Api` at **1769 MB** + `WsConnect` at **1024 MB**.
- That gives ~1.7 s cold / ~94 ms warm end to end, and ~141 ms per warm command.
- Levers 3–5 are not needed unless Phase 5 shows otherwise.

1. Steps 3 and 5 above (free).
2. Raise memory, which also scales CPU. Try 1024 → 1769 MB (one full vCPU). At this traffic it is still inside the free tier.
3. An EventBridge schedule every 5 min that calls the API function with a no-op health event (free tier; keeps one environment warm).
4. SnapStart for .NET: roughly $2–4/mo at 1 GB (snapshot cache + restore charges).
5. Provisioned concurrency = 1: roughly $8–9/mo at 1 GB arm64. Last resort.

---

### Tests

- **Unit:** the `CloudFront-Viewer-Address` parser handles IPv4, IPv6 (`[2001:db8::1]:443` and the bare form), a missing header and garbage.
- **Unit:** with `ClientIpSource=CloudFrontViewerAddress`, two requests with different header IPs land in different rate-limit partitions.
- **Regression:** all existing backend tests pass. `WebApplicationFactory` runs with the Lambda hosting registered but inactive.
- **Build:** `scripts/publish-lambdas.ps1` produces both folders. The API bundle contains `ChipTracker.Presentation.dll` and R2R images (`ChipTracker.*.dll` larger than their IL-only size).
- **Real Lambda behavior** (cold/warm latency, payload v2 mapping, IP header) is verified in deployment-plan spike S2/S3 and in the Phase 3 smoke test.

### Acceptance Criteria

- One code base, two hosts: `docker compose up` and the full e2e suite behave exactly as before.
- The published API bundle runs on `dotnet10` / `arm64` Lambda behind an HTTP API and serves every `/api/*` route.
- No per-request `DescribeTable` calls (verify with SDK metrics or a request log in the spike).
- The rate limiter partitions by the real viewer IP in prod.

### Status (implemented)

All steps 1–6 are in the code. Step 7 (JSON log format) is CDK configuration, done in deployment plan Phase 2.

Additions beyond the original steps:
- The Lambda publish profile also sets `ServerGarbageCollection=false`: one request per environment means a smaller heap and a faster start.
- `ChipTracker.WsConnect` sets `GenerateRuntimeConfigurationFiles`/`CopyLocalLockFileAssemblies`. Without these, its bundle has no `runtimeconfig.json`, and `InvariantGlobalization` doesn't apply.

**Local Lambda verification** (repeatable without AWS):
1. Run each published bundle in `public.ecr.aws/lambda/dotnet:10-arm64` (Runtime Interface Emulator, under qemu) against DynamoDB Local, with the plan's environment variables. Pass `AWS_ENDPOINT_URL_DYNAMODB` for `WsConnect`.
2. POST HTTP API v2 / WebSocket `$connect` events to `http://localhost:<port>/2015-03-31/functions/function/invocations`.

Results:
- **API** (handler `ChipTracker.Presentation`):
  - `/api/health`, create, join and get room all work, and an unknown room returns a JSON 404.
  - The rate limit partitions by `CloudFront-Viewer-Address` (IPv4 and IPv6).
  - Warm invokes take ~75–85 ms even under emulation.
- **WsConnect** (handler `ChipTracker.WsConnect::ChipTracker.WsConnect.Function::HandleConnectAsync`):
  - Responses are 200 (valid room), 400 (bad code) and 404 (unknown room).
  - The connection row is written with its TTL.
- Emulated cold-start numbers are meaningless; real cold starts are measured in spike S2.
