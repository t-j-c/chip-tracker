using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using ChipTracker.Presentation.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace ChipTracker.Presentation.Services;

public class SignalRGameNotifier : IGameNotifier
{
    private readonly IHubContext<GameHub, IGameClient> _hubContext;

    public SignalRGameNotifier(IHubContext<GameHub, IGameClient> hubContext)
    {
        _hubContext = hubContext;
    }

    public Task NotifyGameStateUpdated(string roomCode, GameState state)
    {
        // GameHub broadcasts directly; this stub is kept for completeness
        return Task.CompletedTask;
    }

    public Task NotifyUndoRequested(string roomCode, string requestingPlayerId)
    {
        return Task.CompletedTask;
    }

    public Task NotifyError(string connectionId, string message)
    {
        return Task.CompletedTask;
    }

    public Task NotifyPlayerJoined(string roomCode, PlayerDto player, int playerCount)
    {
        return _hubContext.Clients.Group(roomCode).PlayerJoined(player, playerCount);
    }

    public Task NotifyGameStarted(string roomCode, GameStateDto state)
    {
        return _hubContext.Clients.Group(roomCode).GameStarted(state);
    }
}
