using ChipTracker.Application.Commands;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using FluentAssertions;
using NSubstitute;

namespace ChipTracker.Application.Tests;

public class RequestUndoCommandHandlerTests
{
    private readonly IRoomRepository _repo = Substitute.For<IRoomRepository>();
    private readonly IGameNotifier _notifier = Substitute.For<IGameNotifier>();
    private readonly RequestUndoCommandHandler _handler;

    public RequestUndoCommandHandlerTests()
    {
        _handler = new RequestUndoCommandHandler(_repo, _notifier);
    }

    [Fact]
    public async Task Handle_RoomNotFound_ReturnsError()
    {
        _repo.GetByRoomCodeAsync("ZZZZZZ", Arg.Any<CancellationToken>()).Returns((GameRoom?)null);

        var result = await _handler.Handle(new RequestUndoCommand { RoomCode = "ZZZZZZ", PlayerId = "p1" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("Room not found");
    }

    [Fact]
    public async Task Handle_PlayerNotInRoom_ReturnsError()
    {
        var room = new GameRoom { RoomCode = "ABC123", Players = [new Player { PlayerId = "p1", Name = "Alice" }] };
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new RequestUndoCommand { RoomCode = "ABC123", PlayerId = "p2" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("not in room");
    }

    [Fact]
    public async Task Handle_NoHistory_ReturnsError()
    {
        var room = new GameRoom { RoomCode = "ABC123", Players = [new Player { PlayerId = "p1", Name = "Alice" }, new Player { PlayerId = "p2", Name = "Bob" }] };
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new RequestUndoCommand { RoomCode = "ABC123", PlayerId = "p1" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("No actions to undo");
    }

    [Fact]
    public async Task Handle_SetsPendingUndoAndSaves()
    {
        var room = new GameRoom
        {
            RoomCode = "ABC123",
            Players = [new Player { PlayerId = "p1", Name = "Alice" }, new Player { PlayerId = "p2", Name = "Bob" }],
            CurrentState = new GameState(),
            StateHistory = [new GameState()]
        };
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new RequestUndoCommand { RoomCode = "ABC123", PlayerId = "p1" }, CancellationToken.None);

        result.Success.Should().BeTrue();
        room.PendingUndoRequestBy.Should().Be("p1");
        room.UndoRequestedAt.Should().NotBeNull();
        await _repo.Received(1).SaveAsync(room, Arg.Any<CancellationToken>());
    }
}
