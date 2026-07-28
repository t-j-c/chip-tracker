using System.Text.Json.Serialization;
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

// Add services
builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddScoped<IGameNotifier, SignalRGameNotifier>();
builder.Services.AddSignalR()
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

app.UseRouting();
app.UseCors("AllowAll");

// Health check
app.MapGet("/health", () => Results.Ok("healthy"));

// SignalR Hub
app.MapHub<GameHub>("/hubs/game");

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
});

// Get room endpoint — returns both room info (lobby) and game state (in-game)
api.MapGet("/rooms/{roomCode}", async (string roomCode, IMediator mediator) =>
{
    var query = new GetRoomQuery { RoomCode = roomCode };
    var result = await mediator.Send(query);

    return result.Success
        ? Results.Ok(new { success = true, roomInfo = result.RoomInfo, gameState = result.GameState, error = (string?)null })
        : Results.NotFound(new { success = false, roomInfo = (object?)null, gameState = (object?)null, error = result.Error });
});

// Join room endpoint — player provides their name, gets back a playerId
api.MapPost("/rooms/{roomCode}/join", async (string roomCode, JoinRoomRequest req, IMediator mediator) =>
{
    var command = new JoinRoomCommand { RoomCode = roomCode, PlayerName = req.Name };
    var result = await mediator.Send(command);

    return result.Success
        ? Results.Ok(new { success = true, playerId = result.PlayerId, isCreator = result.IsCreator, error = (string?)null })
        : Results.BadRequest(new { success = false, playerId = (string?)null, isCreator = false, error = result.Error });
});

// Start game endpoint — creator triggers game start
api.MapPost("/rooms/{roomCode}/start", async (string roomCode, StartGameRequest req, IMediator mediator) =>
{
    var command = new StartGameCommand { RoomCode = roomCode, PlayerId = req.PlayerId };
    var result = await mediator.Send(command);

    return result.Success
        ? Results.Ok(new { success = true, gameState = result.GameState, error = (string?)null })
        : Results.BadRequest(new { success = false, gameState = (object?)null, error = result.Error });
});

app.Run();
