using Microsoft.AspNetCore.SignalR;
using MediatR;
using ChipTracker.Application.Commands;
using ChipTracker.Application.Queries;
using ChipTracker.Domain.Enums;

namespace ChipTracker.Presentation.Hubs;

public interface IGameClient
{
    Task GameStateUpdated(object gameState);
    Task UndoRequested(string playerId);
    Task Error(string message);
    Task MappingAccepted(string message);
}

public class GameHub : Hub<IGameClient>
{
    private readonly IMediator _mediator;
    private readonly ILogger<GameHub> _logger;

    public GameHub(IMediator mediator, ILogger<GameHub> logger)
    {
        _mediator = mediator;
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("Client {ClientId} connected", Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation("Client {ClientId} disconnected", Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }

    public async Task JoinRoom(string roomCode, string playerId)
    {
        try
        {
            _logger.LogInformation("Player {PlayerId} joining room {RoomCode}", playerId, roomCode);

            // Add client to SignalR group for this room
            await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);

            // Fetch current game state
            var query = new GetRoomQuery { RoomCode = roomCode };
            var result = await _mediator.Send(query);

            if (result.Success)
            {
                // Send initial game state to joining player
                await Clients.Client(Context.ConnectionId).GameStateUpdated(result.GameState);
            }
            else
            {
                await Clients.Client(Context.ConnectionId).Error(result.Error ?? "Failed to fetch room");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in JoinRoom");
            await Clients.Client(Context.ConnectionId).Error($"Failed to join room: {ex.Message}");
        }
    }

    public async Task SubmitAction(string roomCode, string playerId, int action, int? amount = null)
    {
        try
        {
            _logger.LogInformation("Player {PlayerId} in room {RoomCode} submitting action {Action} amount {Amount}",
                playerId, roomCode, action, amount);

            var command = new ProcessActionCommand
            {
                RoomCode = roomCode,
                PlayerId = playerId,
                Action = (PokerAction)action,
                Amount = amount
            };

            var result = await _mediator.Send(command);

            if (result.Success)
            {
                // Broadcast updated game state to all players in room
                await Clients.Group(roomCode).GameStateUpdated(result.GameState);
            }
            else
            {
                // Send error to specific player
                await Clients.Client(Context.ConnectionId).Error(result.Error ?? "Failed to process action");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in SubmitAction");
            await Clients.Client(Context.ConnectionId).Error($"Failed to submit action: {ex.Message}");
        }
    }

    public async Task RequestUndo(string roomCode, string playerId)
    {
        try
        {
            _logger.LogInformation("Player {PlayerId} in room {RoomCode} requesting undo", playerId, roomCode);

            var command = new UndoActionCommand
            {
                RoomCode = roomCode,
                PlayerId = playerId
            };

            var result = await _mediator.Send(command);

            if (result.Success)
            {
                // Broadcast updated game state
                await Clients.Group(roomCode).GameStateUpdated(result.GameState);
                // Notify other player that undo was accepted
                await Clients.GroupExcept(roomCode, Context.ConnectionId).UndoRequested(playerId);
            }
            else
            {
                await Clients.Client(Context.ConnectionId).Error(result.Error ?? "Failed to undo action");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in RequestUndo");
            await Clients.Client(Context.ConnectionId).Error($"Failed to request undo: {ex.Message}");
        }
    }

    public async Task ResolveShowdown(string roomCode, string winnerPlayerId)
    {
        try
        {
            _logger.LogInformation("Resolving showdown in room {RoomCode} with winner {WinnerId}", roomCode, winnerPlayerId);

            var command = new ResolveShowdownCommand
            {
                RoomCode = roomCode,
                WinnerPlayerId = winnerPlayerId
            };

            var result = await _mediator.Send(command);

            if (result.Success)
            {
                // Broadcast updated game state to all players
                await Clients.Group(roomCode).GameStateUpdated(result.GameState);
            }
            else
            {
                await Clients.Client(Context.ConnectionId).Error(result.Error ?? "Failed to resolve showdown");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in ResolveShowdown");
            await Clients.Client(Context.ConnectionId).Error($"Failed to resolve showdown: {ex.Message}");
        }
    }
}
