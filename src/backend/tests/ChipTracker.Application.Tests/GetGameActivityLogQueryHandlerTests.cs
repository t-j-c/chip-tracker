using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using ChipTracker.Application.Queries;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Enums;
using FluentAssertions;
using NSubstitute;

namespace ChipTracker.Application.Tests;

public class GetGameActivityLogQueryHandlerTests
{
    private readonly IRoomRepository _roomRepository;
    private readonly GetGameActivityLogQueryHandler _handler;

    public GetGameActivityLogQueryHandlerTests()
    {
        _roomRepository = Substitute.For<IRoomRepository>();
        _handler = new GetGameActivityLogQueryHandler(_roomRepository);
    }

    [Fact]
    public async Task Handle_WithValidRoomCode_ReturnsActivityLogEntries()
    {
        // Arrange
        var roomCode = "ROOM001";
        var room = new GameRoom
        {
            RoomCode = roomCode,
            ActivityLog = new List<ActivityEntry>
            {
                new() { Sequence = 1, EntryType = ActivityEntryType.HandStarted, Amount = 0 },
                new() { Sequence = 2, EntryType = ActivityEntryType.BlindPosted, PlayerId = "p1", Amount = 10 },
            }
        };

        _roomRepository.GetByRoomCodeAsync(roomCode, Arg.Any<CancellationToken>())
            .Returns(room);

        var query = new GetGameActivityLogQuery(roomCode, Limit: 10, Offset: 0);

        // Act
        var response = await _handler.Handle(query, CancellationToken.None);

        // Assert
        response.Entries.Should().HaveCount(2);
        response.Total.Should().Be(2);
        response.Entries[0].Sequence.Should().Be(1);
        response.Entries[0].EntryType.Should().Be(ActivityEntryType.HandStarted);
        response.Entries[1].Sequence.Should().Be(2);
        response.Entries[1].PlayerId.Should().Be("p1");
    }

    [Fact]
    public async Task Handle_WithPagination_ReturnsCorrectSubset()
    {
        // Arrange
        var roomCode = "ROOM001";
        var room = new GameRoom
        {
            RoomCode = roomCode,
            ActivityLog = Enumerable.Range(1, 100)
                .Select(i => new ActivityEntry { Sequence = i, EntryType = ActivityEntryType.HandStarted })
                .ToList()
        };

        _roomRepository.GetByRoomCodeAsync(roomCode, Arg.Any<CancellationToken>())
            .Returns(room);

        var query = new GetGameActivityLogQuery(roomCode, Limit: 10, Offset: 20);

        // Act
        var response = await _handler.Handle(query, CancellationToken.None);

        // Assert
        response.Entries.Should().HaveCount(10);
        response.Total.Should().Be(100);
        response.Offset.Should().Be(20);
        response.Limit.Should().Be(10);
        response.Entries[0].Sequence.Should().Be(21);  // Skip 20, take from 21
        response.Entries[9].Sequence.Should().Be(30);
    }

    [Fact]
    public async Task Handle_WithNonExistentRoom_ThrowsInvalidOperationException()
    {
        // Arrange
        var roomCode = "NONEXISTENT";
        _roomRepository.GetByRoomCodeAsync(roomCode, Arg.Any<CancellationToken>())
            .Returns((GameRoom?)null);

        var query = new GetGameActivityLogQuery(roomCode);

        // Act & Assert
        await _handler.Invoking(h => h.Handle(query, CancellationToken.None))
            .Should().ThrowAsync<InvalidOperationException>();
    }

    [Fact]
    public async Task ActivityEntryDto_GetDescription_ReturnsCorrectDescription()
    {
        // Arrange
        var entry = new ActivityEntryDto(
            Sequence: 1,
            EntryType: ActivityEntryType.PlayerAction,
            PlayerId: "p1",
            Action: PokerAction.Bet,
            Amount: 100,
            OldPhase: null,
            NewPhase: null,
            StateVersion: 1,
            IsUndone: false
        );

        // Act
        var description = entry.GetDescription();

        // Assert
        description.Should().Contain("p1");
        description.Should().Contain("bets");
        description.Should().Contain("100");
    }
}
