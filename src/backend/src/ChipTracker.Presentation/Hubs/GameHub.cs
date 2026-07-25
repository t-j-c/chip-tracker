using Microsoft.AspNetCore.SignalR;
using MediatR;
using ChipTracker.Application.Commands;
using ChipTracker.Application.Queries;
using ChipTracker.Domain.Enums;

namespace ChipTracker.Presentation.Hubs;

public interface IGameClient
{
    Task GameStateUpdated(object gameState);
    Task UndoRequested(string requestingPlayerId);
    Task UndoDeclined(string decliningPlayerId);
    Task Error(string message);
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

    public async Task SubmitAction(string roomCode, string playerId, string action, int? amount = null)
    {
        try
        {
            _logger.LogInformation("Player {PlayerId} in room {RoomCode} submitting action {Action} amount {Amount}",
                playerId, roomCode, action, amount);

            if (!Enum.TryParse<PokerAction>(action, ignoreCase: true, out var pokerAction))
            {
                await Clients.Client(Context.ConnectionId).Error($"Unknown action: {action}");
                return;
            }

            var command = new ProcessActionCommand
            {
                RoomCode = roomCode,
                PlayerId = playerId,
                Action = pokerAction,
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

    /// <summary>
    /// Sends an undo request to the other player. Does NOT modify state.
    /// The other player must call ApproveUndo to actually revert.
    /// </summary>
    public async Task RequestUndo(string roomCode, string playerId)
    {
        try
        {
            _logger.LogInformation("Player {PlayerId} in room {RoomCode} requesting undo", playerId, roomCode);
            // Only notify — state unchanged until other player approves
            await Clients.GroupExcept(roomCode, Context.ConnectionId).UndoRequested(playerId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in RequestUndo");
            await Clients.Client(Context.ConnectionId).Error($"Failed to request undo: {ex.Message}");
        }
    }

    /// <summary>
    /// Applies the undo (called by the player who received and approved the undo request).
    /// </summary>
    public async Task ApproveUndo(string roomCode, string approvingPlayerId)
    {
        try
        {
            _logger.LogInformation("Player {PlayerId} approved undo in room {RoomCode}", approvingPlayerId, roomCode);

            var command = new UndoActionCommand
            {
                RoomCode = roomCode,
                PlayerId = approvingPlayerId
            };

            var result = await _mediator.Send(command);

            if (result.Success)
            {
                await Clients.Group(roomCode).GameStateUpdated(result.GameState!);
            }
            else
            {
                await Clients.Client(Context.ConnectionId).Error(result.Error ?? "Failed to undo action");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in ApproveUndo");
            await Clients.Client(Context.ConnectionId).Error($"Failed to approve undo: {ex.Message}");
        }
    }

public async Task ResolveShowdown(string roomCode, string winnerPlayerId, bool isSplit = false)
    {
        try
        {
            _logger.LogInformation("Resolving showdown in room {RoomCode} winner {WinnerId} split {IsSplit}",
                roomCode, winnerPlayerId, isSplit);

            var command = new ResolveShowdownCommand
            {
                RoomCode = roomCode,
                WinnerPlayerId = winnerPlayerId,
                IsSplit = isSplit
            };

            var result = await _mediator.Send(command);

            if (result.Success)
            {
                await Clients.Group(roomCode).GameStateUpdated(result.GameState!);
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

    /// <summary>
    /// Notifies the room that an undo request was declined by the other player.
    /// No state change — just broadcasts the decline so the requester can be informed.
    /// </summary>
    public async Task DeclineUndo(string roomCode, string decliningPlayerId)
    {
        try
        {
            _logger.LogInformation("Player {PlayerId} declined undo in room {RoomCode}", decliningPlayerId, roomCode);
            await Clients.GroupExcept(roomCode, Context.ConnectionId).UndoDeclined(decliningPlayerId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in DeclineUndo");
            await Clients.Client(Context.ConnectionId).Error($"Failed to decline undo: {ex.Message}");
        }
    }
}
