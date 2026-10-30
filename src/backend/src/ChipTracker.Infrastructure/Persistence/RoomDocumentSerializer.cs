using System.Text;
using System.Text.Json;
using Amazon.DynamoDBv2.DocumentModel;
using ChipTracker.Domain.Entities;

namespace ChipTracker.Infrastructure.Persistence;

public static class RoomDocumentSerializer
{
    public const string ExpirationAttribute = "ExpirationTime";
    public const string RevisionAttribute = nameof(GameRoom.Revision);

    /// <summary>Stay safely below DynamoDB's 400 KB item limit.</summary>
    public const int MaxJsonBytes = 350 * 1024;

    /// <summary>
    /// Serializes the room, shrinking it (undo history first, then oldest activity) if needed.
    /// Returns true if anything was trimmed from <paramref name="room"/>.
    /// </summary>
    public static Document Serialize(GameRoom room, DateTime expiresAtUtc, out bool trimmed)
    {
        trimmed = false;
        var json = JsonSerializer.Serialize(room);

        foreach (var keep in new[] { 10, 5, 0 })
        {
            if (Encoding.UTF8.GetByteCount(json) <= MaxJsonBytes) break;
            room.TrimHistory(keep);
            trimmed = true;
            json = JsonSerializer.Serialize(room);
        }

        while (Encoding.UTF8.GetByteCount(json) > MaxJsonBytes && room.ActivityLog.Count > 0)
        {
            room.ActivityLog.RemoveRange(0, Math.Max(1, room.ActivityLog.Count / 4));
            trimmed = true;
            json = JsonSerializer.Serialize(room);
        }

        var document = Document.FromJson(json);
        document["RoomCode"] = room.RoomCode;
        document[ExpirationAttribute] = new DateTimeOffset(expiresAtUtc).ToUnixTimeSeconds();
        return document;
    }

    public static GameRoom Deserialize(Document document)
    {
        var room = JsonSerializer.Deserialize<GameRoom>(document.ToJson())
            ?? throw new InvalidOperationException("Failed to deserialize room");
        room.EnsureStateVersions();
        return room;
    }
}
