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
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.WithOrigins("http://localhost:3000", "http://localhost:5173")
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
        Players = req.Players.Select(p => new CreatePlayerRequest { Name = p.Name, Stack = p.Stack }).ToList(),
        SmallBlind = req.SmallBlind,
        BigBlind = req.BigBlind
    };

    var result = await mediator.Send(command);

    return result.Success
        ? Results.Ok(new { success = true, roomCode = result.RoomCode, player1Id = result.Player1Id, player2Id = result.Player2Id, error = (string?)null })
        : Results.BadRequest(new { success = false, roomCode = (string?)null, player1Id = (string?)null, player2Id = (string?)null, error = result.Error });
});

// Get room endpoint
api.MapGet("/rooms/{roomCode}", async (string roomCode, IMediator mediator) =>
{
    var query = new GetRoomQuery { RoomCode = roomCode };
    var result = await mediator.Send(query);

    return result.Success
        ? Results.Ok(new { success = true, gameState = result.GameState, error = (string?)null })
        : Results.NotFound(new { success = false, gameState = (object?)null, error = result.Error });
});

app.Run();
