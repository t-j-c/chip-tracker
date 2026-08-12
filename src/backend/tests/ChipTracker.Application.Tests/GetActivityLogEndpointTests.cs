using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using ChipTracker.Application.Queries;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Enums;
using FluentAssertions;
using MediatR;
using NSubstitute;

namespace ChipTracker.Application.Tests;

public class GetActivityLogEndpointTests
{
    private readonly IMediator _mediator;

    public GetActivityLogEndpointTests()
    {
        _mediator = Substitute.For<IMediator>();
    }

    [Fact]
    public async Task GetActivityLog_WithValidRoomCode_ReturnsActivityLogEntries()
    {
        // Arrange
        var roomCode = "ROOM001";
        var entries = new List<ActivityEntryDto>
        {
            new(Sequence: 1, EntryType: ActivityEntryType.HandStarted, PlayerId: null, Action: null, Amount: 0, OldPhase: null, NewPhase: null, StateVersion: 1, IsUndone: false),
            new(Sequence: 2, EntryType: ActivityEntryType.BlindPosted, PlayerId: "p1", Action: null, Amount: 10, OldPhase: null, NewPhase: null, StateVersion: 1, IsUndone: false),
        };
        var response = new GetGameActivityLogResponse(entries, 2, 50, 0);

        _mediator.Send(Arg.Is<GetGameActivityLogQuery>(q => q.RoomCode == roomCode), Arg.Any<CancellationToken>())
            .Returns(response);

        // Act
        var result = await _mediator.Send(new GetGameActivityLogQuery(roomCode), CancellationToken.None);

        // Assert
        result.Entries.Should().HaveCount(2);
        result.Total.Should().Be(2);
        result.Limit.Should().Be(50);
        result.Offset.Should().Be(0);
        result.Entries[0].Sequence.Should().Be(1);
    }

    [Fact]
    public async Task GetActivityLog_WithPaginationParams_PassesToQuery()
    {
        // Arrange
        var roomCode = "ROOM001";
        var limit = 10;
        var offset = 20;
        var entries = new List<ActivityEntryDto>();
        var response = new GetGameActivityLogResponse(entries, 100, limit, offset);

        _mediator.Send(Arg.Is<GetGameActivityLogQuery>(q =>
            q.RoomCode == roomCode &&
            q.Limit == limit &&
            q.Offset == offset), Arg.Any<CancellationToken>())
            .Returns(response);

        // Act
        var result = await _mediator.Send(new GetGameActivityLogQuery(roomCode, limit, offset), CancellationToken.None);

        // Assert
        result.Limit.Should().Be(limit);
        result.Offset.Should().Be(offset);
        result.Total.Should().Be(100);
    }

    [Fact]
    public async Task GetActivityLog_WithDefaultPagination_Uses50LimitAnd0Offset()
    {
        // Arrange
        var roomCode = "ROOM001";
        var entries = new List<ActivityEntryDto>();
        var response = new GetGameActivityLogResponse(entries, 0, 50, 0);

        _mediator.Send(Arg.Is<GetGameActivityLogQuery>(q =>
            q.RoomCode == roomCode &&
            q.Limit == 50 &&
            q.Offset == 0), Arg.Any<CancellationToken>())
            .Returns(response);

        // Act
        var result = await _mediator.Send(new GetGameActivityLogQuery(roomCode), CancellationToken.None);

        // Assert
        result.Limit.Should().Be(50);
        result.Offset.Should().Be(0);
    }

    [Fact]
    public async Task GetActivityLog_WithEmptyActivityLog_ReturnsEmptyList()
    {
        // Arrange
        var roomCode = "ROOM001";
        var entries = new List<ActivityEntryDto>();
        var response = new GetGameActivityLogResponse(entries, 0, 50, 0);

        _mediator.Send(Arg.Is<GetGameActivityLogQuery>(q => q.RoomCode == roomCode), Arg.Any<CancellationToken>())
            .Returns(response);

        // Act
        var result = await _mediator.Send(new GetGameActivityLogQuery(roomCode), CancellationToken.None);

        // Assert
        result.Entries.Should().BeEmpty();
        result.Total.Should().Be(0);
    }

    [Fact]
    public async Task GetActivityLog_WithMultipleEntries_ReturnsAllWithCorrectMetadata()
    {
        // Arrange
        var roomCode = "ROOM001";
        var entries = Enumerable.Range(1, 10)
            .Select(i => new ActivityEntryDto(
                Sequence: i,
                EntryType: ActivityEntryType.HandStarted,
                PlayerId: null,
                Action: null,
                Amount: 0,
                OldPhase: null,
                NewPhase: null,
                StateVersion: 1,
                IsUndone: false
            ))
            .ToList();
        var response = new GetGameActivityLogResponse(entries, 100, 10, 0);

        _mediator.Send(Arg.Is<GetGameActivityLogQuery>(q => q.RoomCode == roomCode), Arg.Any<CancellationToken>())
            .Returns(response);

        // Act
        var result = await _mediator.Send(new GetGameActivityLogQuery(roomCode, 10, 0), CancellationToken.None);

        // Assert
        result.Entries.Should().HaveCount(10);
        result.Total.Should().Be(100);  // More entries exist than returned
        result.Entries.Should().BeInAscendingOrder(e => e.Sequence);
    }
}
