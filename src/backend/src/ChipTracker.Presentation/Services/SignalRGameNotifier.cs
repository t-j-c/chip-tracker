using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;

namespace ChipTracker.Presentation.Services;

/// <summary>
/// Placeholder notifier - will be wired up with actual SignalR hub context in Program.cs
/// </summary>
public class SignalRGameNotifier : IGameNotifier
{
    public Task NotifyGameStateUpdated(string roomCode, GameState state)
    {
        // TODO: Wire to actual SignalR hub
        return Task.CompletedTask;
    }

    public Task NotifyUndoRequested(string roomCode, string requestingPlayerId)
    {
        // TODO: Wire to actual SignalR hub
        return Task.CompletedTask;
    }

    public Task NotifyError(string connectionId, string message)
    {
        // TODO: Wire to actual SignalR hub
        return Task.CompletedTask;
    }
}
