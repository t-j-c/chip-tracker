using ChipTracker.Application.Commands;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using FluentAssertions;
using NSubstitute;

namespace ChipTracker.Application.Tests;

public class ClearUndoRequestCommandHandlerTests
{
    private readonly IRoomRepository _repo = Substitute.For<IRoomRepository>();
    private readonly IGameNotifier _notifier = Substitute.For<IGameNotifier>();
    private readonly ClearUndoRequestCommandHandler _handler;

    public ClearUndoRequestCommandHandlerTests()
    {
        _handler = new ClearUndoRequestCommandHandler(_repo, _notifier);
    }

    [Fact]
    public async Task Handle_NoPendingUndo_ReturnsError()
    {
        var room = new GameRoom { RoomCode = "ABC123" };
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new ClearUndoRequestCommand { RoomCode = "ABC123", PlayerId = "p1", IsCancel = false }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("No pending undo request");
    }

    [Fact]
    public async Task Handle_CancelByRequester_ClearsPendingUndo()
    {
        var room = new GameRoom { RoomCode = "ABC123", PendingUndoRequestBy = "p1", UndoRequestedAt = DateTime.UtcNow };
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new ClearUndoRequestCommand { RoomCode = "ABC123", PlayerId = "p1", IsCancel = true }, CancellationToken.None);

        result.Success.Should().BeTrue();
        room.PendingUndoRequestBy.Should().BeNull();
        room.UndoRequestedAt.Should().BeNull();
        await _repo.Received(1).SaveAsync(room, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_CancelByOtherPlayer_ReturnsError()
    {
        var room = new GameRoom { RoomCode = "ABC123", PendingUndoRequestBy = "p1", UndoRequestedAt = DateTime.UtcNow };
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new ClearUndoRequestCommand { RoomCode = "ABC123", PlayerId = "p2", IsCancel = true }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("requester");
    }
}
