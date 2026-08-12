using ChipTracker.Application.Commands;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Engine;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Enums;
using FluentAssertions;
using NSubstitute;

namespace ChipTracker.Application.Tests;

public class UndoActionCommandHandlerTests
{
    private readonly IRoomRepository _repo = Substitute.For<IRoomRepository>();
    private readonly IGameNotifier _notifier = Substitute.For<IGameNotifier>();
    private readonly UndoActionCommandHandler _handler;

    public UndoActionCommandHandlerTests()
    {
        _handler = new UndoActionCommandHandler(_repo, _notifier);
    }

    private static GameRoom MakeRoomWithHistory()
    {
        var players = new List<Player>
        {
            new() { PlayerId = "p1", Name = "Alice", Stack = 1000 },
            new() { PlayerId = "p2", Name = "Bob", Stack = 1000 }
        };

        var room = new GameRoom
        {
            RoomCode = "ABC123",
            StartingStack = 1000,
            SmallBlind = 10,
            BigBlind = 20,
            MaxPlayers = 9,
            Players = players,
            CreatorPlayerId = "p1",
            CreatedAt = DateTime.UtcNow,
            LastUpdatedAt = DateTime.UtcNow,
        };

        var initial = GameEngine.CreateInitialState(players, room.SmallBlind, room.BigBlind, dealerIndex: 0);
        room.CurrentState = initial;

        var afterCall = GameEngine.ValidateAction(initial, new ActionRequest { PlayerId = "p1", Action = PokerAction.Call }).Value!;
        room.PushState(afterCall);

        return room;
    }

    private static GameRoom MakeRoomWithoutHistory()
    {
        var players = new List<Player> { new() { PlayerId = "p1", Name = "Alice", Stack = 1000 } };
        var room = new GameRoom
        {
            RoomCode = "ABC123",
            StartingStack = 1000,
            SmallBlind = 10,
            BigBlind = 20,
            MaxPlayers = 9,
            Players = players,
            CreatorPlayerId = "p1",
            CreatedAt = DateTime.UtcNow,
            LastUpdatedAt = DateTime.UtcNow,
        };
        return room;
    }

    [Fact]
    public async Task Handle_RoomNotFound_ReturnsError()
    {
        _repo.GetByRoomCodeAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns((GameRoom?)null);

        var result = await _handler.Handle(new UndoActionCommand { RoomCode = "ZZZZZZ", PlayerId = "p1" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("not found");
    }

    [Fact]
    public async Task Handle_NoHistory_ReturnsError()
    {
        var room = MakeRoomWithoutHistory();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new UndoActionCommand { RoomCode = "ABC123", PlayerId = "p1" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("No pending undo request");
    }

    [Fact]
    public async Task Handle_RestoresPreviousState_AndBroadcasts()
    {
        var room = MakeRoomWithHistory();
        room.PendingUndoRequestBy = "p2";
        var turnBeforeUndo = room.CurrentState!.ActivePlayerTurnId;
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new UndoActionCommand { RoomCode = "ABC123", PlayerId = "p1" }, CancellationToken.None);

        result.Success.Should().BeTrue();
        room.CurrentState!.ActivePlayerTurnId.Should().Be("p1", "undo restores the pre-call state where p1 was still on turn");
        room.CurrentState.ActivePlayerTurnId.Should().NotBe(turnBeforeUndo);
        await _repo.Received(1).SaveAsync(room, Arg.Any<CancellationToken>());
        await _notifier.Received(1).NotifyGameStateUpdated("ABC123", Arg.Any<GameState>());
    }
}
