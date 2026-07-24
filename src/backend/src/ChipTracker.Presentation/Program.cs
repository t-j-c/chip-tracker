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
builder.Services.AddSignalR();
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
            .AllowAnyMethod()
            .AllowAnyHeader();
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
        ? Results.Ok(new { success = true, roomCode = result.RoomCode, error = (string?)null })
        : Results.BadRequest(new { success = false, roomCode = (string?)null, error = result.Error });
});

// Get room endpoint
api.MapGet("/rooms/{roomCode}", async (string roomCode, IMediator mediator) =>
{
    var query = new GetRoomQuery { RoomCode = roomCode };
    var result = await mediator.Send(query);

    return result.Success
        ? Results.Ok(result.GameState)
        : Results.NotFound(new { error = result.Error });
});

app.Run();
