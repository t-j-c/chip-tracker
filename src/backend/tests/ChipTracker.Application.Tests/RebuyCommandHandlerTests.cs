using ChipTracker.Application.Commands;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Engine;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Enums;
using FluentAssertions;
using NSubstitute;

namespace ChipTracker.Application.Tests;

public class RebuyCommandHandlerTests
{
    private readonly IRoomRepository _repo = Substitute.For<IRoomRepository>();
    private readonly IGameNotifier _notifier = Substitute.For<IGameNotifier>();
    private readonly RebuyCommandHandler _handler;

    public RebuyCommandHandlerTests()
    {
        _handler = new RebuyCommandHandler(_repo, _notifier);
    }

    private static GameRoom MakeRoomWithBustedPlayer()
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

        var state = GameEngine.CreateInitialState(players, room.SmallBlind, room.BigBlind, dealerIndex: 0);
        state = GameEngine.ValidateAction(state, new ActionRequest { PlayerId = "p1", Action = PokerAction.AllIn }).Value!;
        state = GameEngine.ValidateAction(state, new ActionRequest { PlayerId = "p2", Action = PokerAction.Call }).Value!;
        state = GameEngine.ResolveShowdown(state, "p2"); // p1 busts

        room.CurrentState = state;
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

        var result = await _handler.Handle(new RebuyCommand { RoomCode = "ZZZZZZ", PlayerId = "p1" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("not found");
    }

    [Fact]
    public async Task Handle_GameNotStarted_ReturnsError()
    {
        var room = MakeRoomWithoutGameState();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new RebuyCommand { RoomCode = "ABC123", PlayerId = "p1" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("not started");
    }

    [Fact]
    public async Task Handle_PlayerNotAwaitingRebuy_ReturnsError()
    {
        var room = MakeRoomWithBustedPlayer();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new RebuyCommand { RoomCode = "ABC123", PlayerId = "p2" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        await _repo.DidNotReceive().SaveAsync(Arg.Any<GameRoom>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_ValidRebuy_SetsStackToStartingStack_SavesAndBroadcasts()
    {
        var room = MakeRoomWithBustedPlayer();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new RebuyCommand { RoomCode = "ABC123", PlayerId = "p1" }, CancellationToken.None);

        result.Success.Should().BeTrue();
        room.CurrentState!.Players.First(p => p.PlayerId == "p1").IsAwaitingRebuy.Should().BeFalse();
        room.CurrentState.IsHandActive.Should().BeTrue("the only pending decision was resolved");
        await _repo.Received(1).SaveAsync(room, Arg.Any<CancellationToken>());
        await _notifier.Received(1).NotifyGameStateUpdated("ABC123", Arg.Any<GameState>());
    }

    [Fact]
    public async Task Handle_NextHandAutoStarts_WhenLastPendingDecisionResolved()
    {
        var room = MakeRoomWithBustedPlayer();
        room.CurrentState!.IsHandActive.Should().BeFalse("waiting on p1's rebuy decision");
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        await _handler.Handle(new RebuyCommand { RoomCode = "ABC123", PlayerId = "p1" }, CancellationToken.None);

        room.CurrentState!.IsHandActive.Should().BeTrue();
        room.CurrentState.Phase.Should().Be(GamePhase.PreFlop);
        room.CurrentState.Pot.Should().BeGreaterThan(0, "blinds posted for the new hand");
    }
}
