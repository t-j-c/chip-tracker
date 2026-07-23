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
    /// Creates a new room and returns its generated room code.
    /// </summary>
    Task<string> CreateAsync(GameRoom room, CancellationToken cancellationToken = default);
}
