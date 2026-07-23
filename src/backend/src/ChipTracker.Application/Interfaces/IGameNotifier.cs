using ChipTracker.Domain.Entities;

namespace ChipTracker.Application.Interfaces;

/// <summary>
/// Notifies clients of game state changes via SignalR.
/// </summary>
public interface IGameNotifier
{
    /// <summary>
    /// Broadcasts updated game state to all players in the room.
    /// </summary>
    Task NotifyGameStateUpdated(string roomCode, GameState state);

    /// <summary>
    /// Notifies a specific player that an undo has been requested.
    /// </summary>
    Task NotifyUndoRequested(string roomCode, string requestingPlayerId);

    /// <summary>
    /// Sends error message to a specific connection.
    /// </summary>
    Task NotifyError(string connectionId, string message);
}
