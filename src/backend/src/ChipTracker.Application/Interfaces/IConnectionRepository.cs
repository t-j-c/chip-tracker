namespace ChipTracker.Application.Interfaces;

public sealed record RoomConnection(string RoomCode, string ConnectionId, string? PlayerId);

/// <summary>Tracks which WebSocket connections belong to which room (API Gateway mode).</summary>
public interface IConnectionRepository
{
    Task AddAsync(string roomCode, string connectionId, string? playerId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<RoomConnection>> ListByRoomAsync(string roomCode, CancellationToken cancellationToken = default);

    Task RemoveAsync(string roomCode, string connectionId, CancellationToken cancellationToken = default);
}
