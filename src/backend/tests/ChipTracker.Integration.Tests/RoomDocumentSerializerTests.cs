using System.Text;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Enums;
using ChipTracker.Infrastructure.Persistence;
using FluentAssertions;

namespace ChipTracker.Integration.Tests;

public class RoomDocumentSerializerTests
{
    private static GameState State(int players = 9, int version = 0) => new()
    {
        StateVersion = version,
        Pot = 1234,
        Players = Enumerable.Range(0, players).Select(i => new Player
        {
            PlayerId = Guid.NewGuid().ToString(), Name = $"Player {i}", Stack = 12345
        }).ToList()
    };

    private static GameRoom BigRoom(int history, int activity)
    {
        var room = new GameRoom { RoomCode = "ABC123", CurrentState = State(version: 1000) };
        room.StateHistory = Enumerable.Range(0, history).Select(i => State(version: i + 1)).ToList();
        room.ActivityLog = Enumerable.Range(0, activity).Select(i => new ActivityEntry
        {
            Sequence = i, EntryType = ActivityEntryType.PlayerAction, PlayerId = Guid.NewGuid().ToString(),
            PlayerName = "Player Name", Action = PokerAction.Raise, Amount = 200, Phase = GamePhase.Flop
        }).ToList();
        return room;
    }

    [Fact]
    public void WorstCaseWithCappedHistory_FitsWithoutTrimming()
    {
        var room = BigRoom(GameRoom.MaxUndoHistory, 500);

        var doc = RoomDocumentSerializer.Serialize(room, DateTime.UtcNow.AddDays(1), out var trimmed);

        trimmed.Should().BeFalse();
        Encoding.UTF8.GetByteCount(doc.ToJson()).Should().BeLessThan(RoomDocumentSerializer.MaxJsonBytes);
        doc.Should().ContainKey(RoomDocumentSerializer.ExpirationAttribute);
    }

    [Fact]
    public void OversizedRoom_TrimsHistoryBeforeActivity()
    {
        var room = BigRoom(history: 400, activity: 500);

        var doc = RoomDocumentSerializer.Serialize(room, DateTime.UtcNow.AddDays(1), out var trimmed);

        trimmed.Should().BeTrue();
        Encoding.UTF8.GetByteCount(doc.ToJson()).Should().BeLessThan(RoomDocumentSerializer.MaxJsonBytes);
        room.ActivityLog.Should().HaveCount(500);
        room.StateHistory.Count.Should().BeLessThan(400);
    }

    [Fact]
    public void ExpirationTime_IsEpochSecondsOfExpiry()
    {
        var expiry = DateTime.UtcNow.AddDays(1);
        var doc = RoomDocumentSerializer.Serialize(BigRoom(1, 1), expiry, out _);

        doc[RoomDocumentSerializer.ExpirationAttribute].AsLong()
            .Should().Be(new DateTimeOffset(expiry).ToUnixTimeSeconds());
    }

    [Fact]
    public void RoundTrip_PreservesStateVersions()
    {
        var room = BigRoom(3, 2);
        var doc = RoomDocumentSerializer.Serialize(room, DateTime.UtcNow.AddDays(1), out _);

        var loaded = RoomDocumentSerializer.Deserialize(doc);

        loaded.CurrentState!.StateVersion.Should().Be(1000);
        loaded.StateHistory.Should().HaveCount(3);
    }
}
