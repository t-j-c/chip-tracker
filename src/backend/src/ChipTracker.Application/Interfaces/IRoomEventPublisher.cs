using ChipTracker.Application.DTOs;

namespace ChipTracker.Application.Interfaces;

public static class RoomEventTypes
{
    public const string PlayerJoined = "playerJoined";
    public const string GameStarted = "gameStarted";
    public const string GameStateUpdated = "gameStateUpdated";
    public const string UndoRequested = "undoRequested";
    public const string UndoDeclined = "undoDeclined";
    public const string UndoCancelled = "undoCancelled";
}

/// <summary>A room change pushed to every connected client. Always carries a full snapshot.</summary>
public sealed record RoomEvent(string Type, string RoomCode, long Revision, string? ActorPlayerId, RoomSnapshot Snapshot);

/// <summary>Pushes room events to connected clients (in-process sockets or API Gateway WebSockets).</summary>
public interface IRoomEventPublisher
{
    Task PublishAsync(RoomEvent evt, CancellationToken cancellationToken = default);
}
