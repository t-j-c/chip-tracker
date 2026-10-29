using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using ChipTracker.Presentation.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.SignalR;
using ChipTracker.Application;
using ChipTracker.Application.Commands;
using ChipTracker.Application.Interfaces;
using ChipTracker.Application.Queries;
using ChipTracker.Infrastructure;
using ChipTracker.Presentation.Endpoints;
using ChipTracker.Presentation.Hubs;
using ChipTracker.Presentation.Services;
using MediatR;

var builder = WebApplication.CreateBuilder(args);

var rateLimits = builder.Configuration.GetSection(RateLimitOptions.SectionName).Get<RateLimitOptions>() ?? new RateLimitOptions();
builder.Services.Configure<RateLimitOptions>(builder.Configuration.GetSection(RateLimitOptions.SectionName));
builder.Services.AddSingleton<HubRateLimitFilter>();

// Trust exactly the configured number of proxy hops (nginx locally, CloudFront/ALB when deployed).
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = rateLimits.ForwardLimit;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

static RateLimitPartition<string> PerIp(HttpContext ctx, int perMinute) =>
    RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = perMinute,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        });

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, token) =>
    {
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
            context.HttpContext.Response.Headers.RetryAfter = ((int)retryAfter.TotalSeconds).ToString();
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        await context.HttpContext.Response.WriteAsJsonAsync(
            new { success = false, error = "Too many requests, please wait a moment and try again." }, token);
    };
    options.AddPolicy("create-room", ctx => PerIp(ctx, rateLimits.CreateRoomPerMinute));
    options.AddPolicy("join", ctx => PerIp(ctx, rateLimits.JoinPerMinute));
    options.AddPolicy("read", ctx => PerIp(ctx, rateLimits.ReadPerMinute));
    options.AddPolicy("hub-connect", ctx => PerIp(ctx, rateLimits.HubConnectPerMinute));
});

// Add services
builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddScoped<IGameNotifier, SignalRGameNotifier>();
builder.Services.AddSignalR(options => options.AddFilter<HubRateLimitFilter>())
    .AddJsonProtocol(options =>
    {
        options.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });
builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:3000", "http://localhost:5173" };

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.WithOrigins(allowedOrigins)
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials();
    });
});

var app = builder.Build();

app.UseForwardedHeaders();
app.UseRouting();
app.UseCors("AllowAll");
app.UseRateLimiter();

// Health check
app.MapGet("/health", () => Results.Ok("healthy"));

// SignalR Hub
app.MapHub<GameHub>("/hubs/game").RequireRateLimiting("hub-connect");

// REST Endpoints
var api = app.MapGroup("/api");

// Create room endpoint
api.MapPost("/rooms", async (CreateRoomRequest req, IMediator mediator) =>
{
    var command = new CreateRoomCommand
    {
        StartingStack = req.StartingStack,
        SmallBlind = req.SmallBlind,
        BigBlind = req.BigBlind
    };

    var result = await mediator.Send(command);

    return result.Success
        ? Results.Ok(new { success = true, roomCode = result.RoomCode, error = (string?)null })
        : Results.BadRequest(new { success = false, roomCode = (string?)null, error = result.Error });
}).RequireRateLimiting("create-room");

// Get room endpoint — returns both room info (lobby) and game state (in-game)
api.MapGet("/rooms/{roomCode}", async (string roomCode, IMediator mediator) =>
{
    var query = new GetRoomQuery { RoomCode = roomCode };
    var result = await mediator.Send(query);

    return result.Success
        ? Results.Ok(new { success = true, roomInfo = result.RoomInfo, gameState = result.GameState, error = (string?)null })
        : Results.NotFound(new { success = false, roomInfo = (object?)null, gameState = (object?)null, error = result.Error });
}).RequireRateLimiting("read");

// Join room endpoint — player provides their name, gets back a playerId
api.MapPost("/rooms/{roomCode}/join", async (string roomCode, JoinRoomRequest req, IMediator mediator) =>
{
    var command = new JoinRoomCommand { RoomCode = roomCode, PlayerName = req.Name };
    var result = await mediator.Send(command);

    return result.Success
        ? Results.Ok(new { success = true, playerId = result.PlayerId, isCreator = result.IsCreator, error = (string?)null })
        : Results.BadRequest(new { success = false, playerId = (string?)null, isCreator = false, error = result.Error });
}).RequireRateLimiting("join");

// Start game endpoint — creator triggers game start
api.MapPost("/rooms/{roomCode}/start", async (string roomCode, StartGameRequest req, IMediator mediator) =>
{
    var command = new StartGameCommand { RoomCode = roomCode, PlayerId = req.PlayerId };
    var result = await mediator.Send(command);

    return result.Success
        ? Results.Ok(new { success = true, gameState = result.GameState, error = (string?)null })
        : Results.BadRequest(new { success = false, gameState = (object?)null, error = result.Error });
}).RequireRateLimiting("join");

// Get activity log endpoint — returns activity history with pagination
api.MapGet("/rooms/{roomCode}/activity", async (string roomCode, int? limit, int? offset, IMediator mediator) =>
{
    try
    {
        var query = new GetGameActivityLogQuery(roomCode, limit, offset);
        var result = await mediator.Send(query);

        return Results.Ok(new { success = true, entries = result.Entries, total = result.Total, limit = result.Limit, offset = result.Offset, error = (string?)null });
    }
    catch (InvalidOperationException ex)
    {
        return Results.NotFound(new { success = false, error = ex.Message });
    }
}).RequireRateLimiting("read");

app.Run();

public partial class Program;
