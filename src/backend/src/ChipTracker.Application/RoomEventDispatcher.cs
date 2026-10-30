using System.Text.Json;
using System.Text.Json.Serialization;
using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace ChipTracker.Application;

/// <summary>
/// Builds the snapshot for a just-saved room and publishes exactly one event for it.
/// A publish failure is logged and never fails the command: the state is already committed
/// and clients heal on their next resync.
/// </summary>
public class RoomEventDispatcher
{
    private readonly IRoomEventPublisher _publisher;
    private readonly ILogger<RoomEventDispatcher> _logger;

    public RoomEventDispatcher(IRoomEventPublisher publisher, ILogger<RoomEventDispatcher> logger)
    {
        _publisher = publisher;
        _logger = logger;
    }

    public async Task<RoomSnapshot> PublishAsync(string type, GameRoom room, string? actorPlayerId,
        CancellationToken cancellationToken)
    {
        var snapshot = RoomSnapshot.From(room);
        try
        {
            await _publisher.PublishAsync(new RoomEvent(type, room.RoomCode, snapshot.Revision, actorPlayerId, snapshot),
                cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to publish {EventType} for room {RoomCode}", type, room.RoomCode);
        }

        return snapshot;
    }
}

/// <summary>Serializes events into the JSON text frames sent over the WebSocket.</summary>
public static class RoomEventSerializer
{
    public const int MaxFrameBytes = 30 * 1024;

    public static readonly JsonSerializerOptions Options = CreateOptions();

    private static JsonSerializerOptions CreateOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter());
        return options;
    }

    public static string Serialize(RoomEvent evt)
    {
        var json = JsonSerializer.Serialize(new
        {
            type = evt.Type,
            roomCode = evt.RoomCode,
            revision = evt.Revision,
            actorPlayerId = evt.ActorPlayerId,
            roomInfo = evt.Snapshot.RoomInfo,
            gameState = evt.Snapshot.GameState
        }, Options);

        if (System.Text.Encoding.UTF8.GetByteCount(json) <= MaxFrameBytes)
            return json;

        // Too large for one frame: tell clients to resync over REST instead.
        return JsonSerializer.Serialize(new
        {
            type = evt.Type,
            roomCode = evt.RoomCode,
            revision = evt.Revision,
            actorPlayerId = evt.ActorPlayerId,
            stale = true
        }, Options);
    }
}
