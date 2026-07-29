using ChipTracker.Application.Commands;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Engine;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Enums;
using FluentAssertions;
using NSubstitute;

namespace ChipTracker.Application.Tests;

public class DeclineRebuyCommandHandlerTests
{
    private readonly IRoomRepository _repo = Substitute.For<IRoomRepository>();
    private readonly IGameNotifier _notifier = Substitute.For<IGameNotifier>();
    private readonly DeclineRebuyCommandHandler _handler;

    public DeclineRebuyCommandHandlerTests()
    {
        _handler = new DeclineRebuyCommandHandler(_repo, _notifier);
    }

    private static GameRoom MakeThreeHandedRoomWithBustedPlayer()
    {
        // Give p1 a stack of exactly enough to go all-in and lose everything, with p2/p3
        // having plenty left so the room remains 2-seated (>= 2) after p1 cashes out.
        var players = new List<Player>
        {
            new() { PlayerId = "p1", Name = "Alice", Stack = 1000 },
            new() { PlayerId = "p2", Name = "Bob", Stack = 1000 },
            new() { PlayerId = "p3", Name = "Cara", Stack = 1000 }
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
        state = GameEngine.ValidateAction(state, new ActionRequest { PlayerId = "p3", Action = PokerAction.Fold }).Value!;
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

        var result = await _handler.Handle(new DeclineRebuyCommand { RoomCode = "ZZZZZZ", PlayerId = "p1" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("not found");
    }

    [Fact]
    public async Task Handle_GameNotStarted_ReturnsError()
    {
        var room = MakeRoomWithoutGameState();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new DeclineRebuyCommand { RoomCode = "ABC123", PlayerId = "p1" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("not started");
    }

    [Fact]
    public async Task Handle_PlayerNotAwaitingRebuy_ReturnsError()
    {
        var room = MakeThreeHandedRoomWithBustedPlayer();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new DeclineRebuyCommand { RoomCode = "ABC123", PlayerId = "p2" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        await _repo.DidNotReceive().SaveAsync(Arg.Any<GameRoom>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_ValidCashOut_MarksEliminated_SavesAndBroadcasts()
    {
        var room = MakeThreeHandedRoomWithBustedPlayer();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new DeclineRebuyCommand { RoomCode = "ABC123", PlayerId = "p1" }, CancellationToken.None);

        result.Success.Should().BeTrue();
        var p1 = room.CurrentState!.Players.First(p => p.PlayerId == "p1");
        p1.IsEliminated.Should().BeTrue();
        p1.IsAwaitingRebuy.Should().BeFalse();
        room.CurrentState.IsHandActive.Should().BeTrue("two seated players remain, no other pending decisions");
        await _repo.Received(1).SaveAsync(room, Arg.Any<CancellationToken>());
        await _notifier.Received(1).NotifyGameStateUpdated("ABC123", Arg.Any<GameState>());
    }
}
