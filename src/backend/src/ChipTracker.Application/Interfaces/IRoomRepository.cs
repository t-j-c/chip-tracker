using ChipTracker.Domain.Entities;

namespace ChipTracker.Application.Interfaces;

/// <summary>
/// Repository for persisting and retrieving game rooms.
/// </summary>
public interface IRoomRepository
{
    /// <summary>
    /// Retrieves a room by its room code.
    /// </summary>
    Task<GameRoom?> GetByRoomCodeAsync(string roomCode, CancellationToken cancellationToken = default);

    /// <summary>
    /// Saves or updates a room.
    /// </summary>
    Task SaveAsync(GameRoom room, CancellationToken cancellationToken = default);

    /// <summary>
    /// Creates a new room only if its code is not already in use.
    /// Returns false when the code is taken.
    /// </summary>
    Task<bool> TryCreateAsync(GameRoom room, CancellationToken cancellationToken = default);

    /// <summary>
    /// Checks that a room exists and has not expired, without reading the full item.
    /// </summary>
    Task<bool> ExistsAsync(string roomCode, CancellationToken cancellationToken = default);
}
