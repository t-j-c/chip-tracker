using ChipTracker.Application.Commands;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Engine;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Enums;
using FluentAssertions;
using NSubstitute;

namespace ChipTracker.Application.Tests;

public class ResolveShowdownCommandHandlerTests
{
    private readonly IRoomRepository _repo = Substitute.For<IRoomRepository>();
    private readonly IGameNotifier _notifier = Substitute.For<IGameNotifier>();
    private readonly ResolveShowdownCommandHandler _handler;

    public ResolveShowdownCommandHandlerTests()
    {
        _handler = new ResolveShowdownCommandHandler(_repo, _notifier);
    }

    private static GameRoom MakeRoomAtShowdown(bool viaAllIn = false)
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
        if (viaAllIn)
        {
            state = GameEngine.ValidateAction(state, new ActionRequest { PlayerId = "p1", Action = PokerAction.AllIn }).Value!;
            state = GameEngine.ValidateAction(state, new ActionRequest { PlayerId = "p2", Action = PokerAction.Call }).Value!;
        }
        else
        {
            state.Phase = GamePhase.Showdown;
            state.IsHandActive = false;
        }

        room.CurrentState = state;
        return room;
    }

    private static GameRoom MakeRoomHandInProgress()
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

        room.CurrentState = GameEngine.CreateInitialState(players, room.SmallBlind, room.BigBlind, dealerIndex: 0);
        return room;
    }

    [Fact]
    public async Task Handle_RoomNotFound_ReturnsError()
    {
        _repo.GetByRoomCodeAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns((GameRoom?)null);

        var result = await _handler.Handle(new ResolveShowdownCommand { RoomCode = "ZZZZZZ", WinnerPlayerId = "p1" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("not found");
    }

    [Fact]
    public async Task Handle_HandStillInProgress_ReturnsError()
    {
        var room = MakeRoomHandInProgress();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new ResolveShowdownCommand { RoomCode = "ABC123", WinnerPlayerId = "p1" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("in progress");
    }

    [Fact]
    public async Task Handle_AllInRunout_AwardsPot()
    {
        var room = MakeRoomAtShowdown(viaAllIn: true);
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new ResolveShowdownCommand { RoomCode = "ABC123", WinnerPlayerId = "p1" }, CancellationToken.None);

        result.Success.Should().BeTrue();
        room.CurrentState!.Phase.Should().Be(GamePhase.PreFlop, "showdown resolved");
        // p2 called the all-in with their whole stack and lost, so they busted to zero and are
        // now awaiting a rebuy decision - the next hand is blocked until they resolve it.
        room.CurrentState.Players.First(p => p.PlayerId == "p1").Stack.Should().BeGreaterThan(0);
        room.CurrentState.Players.First(p => p.PlayerId == "p2").IsAwaitingRebuy.Should().BeTrue();
        room.CurrentState.IsHandActive.Should().BeFalse("busted player must decide before the next hand starts");
    }

    [Fact]
    public async Task Handle_UnknownWinner_ReturnsError()
    {
        var room = MakeRoomAtShowdown();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new ResolveShowdownCommand { RoomCode = "ABC123", WinnerPlayerId = "ghost" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("Winner not found");
    }

    [Fact]
    public async Task Handle_Split_DividesPot()
    {
        var room = MakeRoomAtShowdown();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new ResolveShowdownCommand { RoomCode = "ABC123", IsSplit = true }, CancellationToken.None);

        result.Success.Should().BeTrue();
        await _repo.Received(1).SaveAsync(room, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_PushesStateForUndo()
    {
        // Guards against the bug where PushState received the same mutated reference that
        // was read, making StateHistory contain the already-resolved state instead of the
        // pre-showdown state.
        var room = MakeRoomAtShowdown();
        var preResolveActivePlayerCount = room.CurrentState!.Players.Count(p => !p.HasFolded);
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        await _handler.Handle(new ResolveShowdownCommand { RoomCode = "ABC123", WinnerPlayerId = "p1" }, CancellationToken.None);

        room.StateHistory.Should().HaveCount(1);
        var historicalState = room.StateHistory[0];
        historicalState.Phase.Should().Be(GamePhase.Showdown, "history must retain the pre-resolution showdown state");
        historicalState.Players.Count(p => !p.HasFolded).Should().Be(preResolveActivePlayerCount);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Multi-pot (side pot) awards
    // ──────────────────────────────────────────────────────────────────────────

    private static GameRoom MakeThreeHandedRoomAtShowdownWithSidePot()
    {
        // p1 short-stacked all-in for 300 total, p2/p3 both put in 700 total - creates a
        // main pot (all three eligible) and a side pot (p2/p3 only).
        var players = new List<Player>
        {
            new() { PlayerId = "p1", Name = "Alice", Stack = 0, TotalContributed = 300, IsAllIn = true },
            new() { PlayerId = "p2", Name = "Bob",   Stack = 300, TotalContributed = 700 },
            new() { PlayerId = "p3", Name = "Cara",  Stack = 300, TotalContributed = 700 },
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

        var state = new GameState
        {
            Players = players,
            Pot = 1700,
            CurrentBet = 0,
            Phase = GamePhase.Showdown,
            DealerIndex = 0,
            SmallBlind = 10,
            BigBlind = 20,
            MinRaise = 20,
            IsHandActive = false,
        };
        state.Pots = GameEngine.BuildPots(state);

        room.CurrentState = state;
        return room;
    }

    [Fact]
    public async Task Handle_MultiPotAwards_DistributesCorrectly()
    {
        var room = MakeThreeHandedRoomAtShowdownWithSidePot();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var command = new ResolveShowdownCommand
        {
            RoomCode = "ABC123",
            Awards =
            [
                new PotAward { PotIndex = 0, WinnerPlayerIds = ["p1"] },
                new PotAward { PotIndex = 1, WinnerPlayerIds = ["p2"] },
            ]
        };

        var result = await _handler.Handle(command, CancellationToken.None);

        result.Success.Should().BeTrue();
        room.CurrentState!.IsHandActive.Should().BeTrue("next hand started");
        await _repo.Received(1).SaveAsync(room, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_IneligibleWinnerForSidePot_ReturnsError()
    {
        var room = MakeThreeHandedRoomAtShowdownWithSidePot();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var command = new ResolveShowdownCommand
        {
            RoomCode = "ABC123",
            Awards =
            [
                new PotAward { PotIndex = 0, WinnerPlayerIds = ["p1"] },
                new PotAward { PotIndex = 1, WinnerPlayerIds = ["p1"] }, // p1 not eligible for side pot
            ]
        };

        var result = await _handler.Handle(command, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("not eligible");
        await _repo.DidNotReceive().SaveAsync(Arg.Any<GameRoom>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_MissingAwardForAPot_ReturnsError()
    {
        var room = MakeThreeHandedRoomAtShowdownWithSidePot();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var command = new ResolveShowdownCommand
        {
            RoomCode = "ABC123",
            Awards = [new PotAward { PotIndex = 0, WinnerPlayerIds = ["p1"] }] // side pot omitted
        };

        var result = await _handler.Handle(command, CancellationToken.None);

        result.Success.Should().BeFalse();
        await _repo.DidNotReceive().SaveAsync(Arg.Any<GameRoom>(), Arg.Any<CancellationToken>());
    }
}
