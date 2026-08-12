using ChipTracker.Application.Commands;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Engine;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Enums;
using FluentAssertions;
using NSubstitute;

namespace ChipTracker.Application.Tests;

public class ProcessActionCommandHandlerTests
{
    private readonly IRoomRepository _repo = Substitute.For<IRoomRepository>();
    private readonly IGameNotifier _notifier = Substitute.For<IGameNotifier>();
    private readonly ProcessActionCommandHandler _handler;

    public ProcessActionCommandHandlerTests()
    {
        _handler = new ProcessActionCommandHandler(_repo, _notifier);
    }

    private static GameRoom MakeStartedRoom(int stack1 = 1000, int stack2 = 1000)
    {
        var players = new List<Player>
        {
            new() { PlayerId = "p1", Name = "Alice", Stack = stack1 },
            new() { PlayerId = "p2", Name = "Bob", Stack = stack2 }
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

        room.CurrentState = GameEngine.CreateInitialState(players, room.SmallBlind, room.BigBlind, dealerIndex: 0);
        return room;
    }

    private static GameRoom MakeRoomWithoutGameState()
    {
        return new GameRoom
        {
            RoomCode = "ABC123",
            StartingStack = 1000,
            SmallBlind = 10,
            BigBlind = 20,
            MaxPlayers = 9,
            Players = [new() { PlayerId = "p1", Name = "Alice", Stack = 1000 }],
            CreatorPlayerId = "p1",
            CreatedAt = DateTime.UtcNow,
            LastUpdatedAt = DateTime.UtcNow,
            CurrentState = null
        };
    }

    [Fact]
    public async Task Handle_RoomNotFound_ReturnsError()
    {
        _repo.GetByRoomCodeAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns((GameRoom?)null);

        var result = await _handler.Handle(new ProcessActionCommand { RoomCode = "ZZZZZZ", PlayerId = "p1", Action = PokerAction.Check }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("not found");
    }

    [Fact]
    public async Task Handle_GameNotStarted_ReturnsError()
    {
        var room = MakeRoomWithoutGameState();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new ProcessActionCommand { RoomCode = "ABC123", PlayerId = "p1", Action = PokerAction.Check }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("not started");
        await _repo.DidNotReceive().SaveAsync(Arg.Any<GameRoom>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_InvalidAction_ReturnsError_AndDoesNotSave()
    {
        var room = MakeStartedRoom();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        // p2 acting when it's p1's turn
        var result = await _handler.Handle(new ProcessActionCommand { RoomCode = "ABC123", PlayerId = "p2", Action = PokerAction.Check }, CancellationToken.None);

        result.Success.Should().BeFalse();
        await _repo.DidNotReceive().SaveAsync(Arg.Any<GameRoom>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_ValidAction_PushesStateSavesAndBroadcasts()
    {
        var room = MakeStartedRoom();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new ProcessActionCommand { RoomCode = "ABC123", PlayerId = "p1", Action = PokerAction.Call }, CancellationToken.None);

        result.Success.Should().BeTrue();
        await _repo.Received(1).SaveAsync(room, Arg.Any<CancellationToken>());
        await _notifier.Received(1).NotifyGameStateUpdated("ABC123", Arg.Any<GameState>());
    }

    [Fact]
    public async Task Handle_AllInCalled_ReturnsShowdownState()
    {
        var room = MakeStartedRoom();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        await _handler.Handle(new ProcessActionCommand { RoomCode = "ABC123", PlayerId = "p1", Action = PokerAction.AllIn }, CancellationToken.None);
        var result = await _handler.Handle(new ProcessActionCommand { RoomCode = "ABC123", PlayerId = "p2", Action = PokerAction.Call }, CancellationToken.None);

        result.Success.Should().BeTrue();
        room.CurrentState!.Phase.Should().Be(GamePhase.Showdown, "no further action is possible once both players are all-in");
        room.CurrentState.IsHandActive.Should().BeFalse();
        room.CurrentState.ActivePlayerTurnId.Should().BeNull();
    }

    [Fact]
    public async Task Handle_ActionAfterHandComplete_ReturnsError()
    {
        var room = MakeStartedRoom();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        await _handler.Handle(new ProcessActionCommand { RoomCode = "ABC123", PlayerId = "p1", Action = PokerAction.AllIn }, CancellationToken.None);
        await _handler.Handle(new ProcessActionCommand { RoomCode = "ABC123", PlayerId = "p2", Action = PokerAction.Call }, CancellationToken.None);

        // Hand is now over (Showdown, inactive) - any further action must be rejected.
        var result = await _handler.Handle(new ProcessActionCommand { RoomCode = "ABC123", PlayerId = "p2", Action = PokerAction.Check }, CancellationToken.None);

        result.Success.Should().BeFalse();
    }
}
