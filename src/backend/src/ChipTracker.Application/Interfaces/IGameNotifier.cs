using ChipTracker.Application.DTOs;
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

    /// <summary>
    /// Notifies all players in the lobby that a new player has joined.
    /// </summary>
    Task NotifyPlayerJoined(string roomCode, PlayerDto player, int playerCount);

    /// <summary>
    /// Notifies all players that the game has started with the initial state.
    /// </summary>
    Task NotifyGameStarted(string roomCode, GameStateDto state);
}
