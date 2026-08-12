using ChipTracker.Domain.Engine;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Enums;
using FluentAssertions;

namespace ChipTracker.Domain.Tests;

/// <summary>
/// Tests for the busted-player rebuy/cash-out flow: a player who reaches Stack == 0 at the
/// end of a hand is marked <see cref="Player.IsAwaitingRebuy"/> and the next hand is blocked
/// until every such player decides to rebuy (restores their stack) or cash out (marks them
/// <see cref="Player.IsEliminated"/>, excluding them from blinds/dealer rotation/turn order).
/// Eliminated players may buy back in at any time via the same rebuy path.
/// </summary>
public class RebuyTests
{
    // ──────────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────────

    private static List<Player> TwoPlayers(int stack1 = 1000, int stack2 = 1000) =>
    [
        new() { PlayerId = "p1", Name = "Alice", Stack = stack1 },
        new() { PlayerId = "p2", Name = "Bob",   Stack = stack2 }
    ];

    private static GameState HeadsUpState(int dealerIndex = 0, int smallBlind = 10, int bigBlind = 20,
        int stack1 = 1000, int stack2 = 1000) =>
        GameEngine.CreateInitialState(TwoPlayers(stack1, stack2), smallBlind, bigBlind, dealerIndex);

    private static ActionRequest Action(string playerId, PokerAction action, int? amount = null) =>
        new() { PlayerId = playerId, Action = action, Amount = amount };

    /// <summary>Constructs a raw, already-settled GameState (no pending action) for tests that
    /// need direct control over player flags without driving a full hand.</summary>
    private static GameState RawState(List<Player> players, int dealerIndex = 0, bool isHandActive = false) =>
        new()
        {
            Players = players,
            Pot = 0,
            CurrentBet = 0,
            Phase = GamePhase.PreFlop,
            DealerIndex = dealerIndex,
            SmallBlind = 10,
            BigBlind = 20,
            MinRaise = 20,
            IsHandActive = isHandActive
        };

    // ──────────────────────────────────────────────────────────────────────────
    // Busting: showdown result marks the loser awaiting rebuy, blocks the next hand
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void Showdown_BustedPlayer_MarkedAwaitingRebuy()
    {
        var state = HeadsUpState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.AllIn)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Call)).Value!;
        state.Phase.Should().Be(GamePhase.Showdown);

        var newState = GameEngine.ResolveShowdown(state, "p2"); // p2 wins everything, p1 -> 0

        var p1 = newState.Players.First(p => p.PlayerId == "p1");
        p1.Stack.Should().Be(0);
        p1.IsAwaitingRebuy.Should().BeTrue();
    }

    [Fact]
    public void Showdown_BustedPlayer_NextHandNotStartedUntilResolved()
    {
        var state = HeadsUpState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.AllIn)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Call)).Value!;

        var newState = GameEngine.ResolveShowdown(state, "p2");

        newState.IsHandActive.Should().BeFalse("the busted player must decide before a new hand can start");
        newState.ActivePlayerTurnId.Should().BeNull();
        newState.Pot.Should().Be(0, "blinds are not posted while a rebuy decision is pending");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Rebuy: restores stack, clears the flag, and starts the next hand once resolved
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void Rebuy_SetsStackToStartingStack_AndClearsFlag()
    {
        var state = HeadsUpState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.AllIn)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Call)).Value!;
        var busted = GameEngine.ResolveShowdown(state, "p2");

        var result = GameEngine.ApplyRebuy(busted, "p1", 1000);

        result.IsSuccess.Should().BeTrue();
        var p1 = result.Value!.Players.First(p => p.PlayerId == "p1");
        p1.IsAwaitingRebuy.Should().BeFalse();
        p1.Stack.Should().BeGreaterThan(0, "stack was restored (minus whatever blind was posted starting the new hand)");
    }

    [Fact]
    public void Rebuy_AllResolved_NextHandStartsWithBlinds()
    {
        var state = HeadsUpState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.AllIn)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Call)).Value!;
        var busted = GameEngine.ResolveShowdown(state, "p2");

        var result = GameEngine.ApplyRebuy(busted, "p1", 1000);

        var newState = result.Value!;
        newState.IsHandActive.Should().BeTrue();
        newState.Phase.Should().Be(GamePhase.PreFlop);
        newState.Pot.Should().BeGreaterThan(0, "blinds posted now that no one is awaiting a decision");
        newState.ActivePlayerTurnId.Should().NotBeNull();
    }

    [Fact]
    public void ApplyRebuy_UnknownPlayer_ReturnsFailure()
    {
        var state = HeadsUpState(dealerIndex: 0);

        var result = GameEngine.ApplyRebuy(state, "ghost", 1000);

        result.IsSuccess.Should().BeFalse();
    }

    [Fact]
    public void ApplyRebuy_PlayerNotEligible_ReturnsFailure()
    {
        // p1 has a full stack and is not awaiting rebuy or eliminated - rebuy must be rejected.
        var state = HeadsUpState(dealerIndex: 0);

        var result = GameEngine.ApplyRebuy(state, "p1", 1000);

        result.IsSuccess.Should().BeFalse();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Cash out: eliminates the player, excluding them from rotation
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void CashOut_MarksEliminated_AndExcludesFromRotation()
    {
        var players = new List<Player>
        {
            new() { PlayerId = "p1", Name = "Alice", Stack = 0, IsAwaitingRebuy = true },
            new() { PlayerId = "p2", Name = "Bob",   Stack = 500 },
            new() { PlayerId = "p3", Name = "Cara",  Stack = 500 },
        };
        var state = RawState(players, dealerIndex: 0);

        var result = GameEngine.ApplyCashOut(state, "p1");

        result.IsSuccess.Should().BeTrue();
        var newState = result.Value!;
        var p1 = newState.Players.First(p => p.PlayerId == "p1");
        p1.IsEliminated.Should().BeTrue();
        p1.IsAwaitingRebuy.Should().BeFalse();

        // Two seated players remain with chips - the hand starts without p1.
        newState.IsHandActive.Should().BeTrue();
        p1.CurrentBet.Should().Be(0, "p1 is not seated and receives no blind");
    }

    [Fact]
    public void Eliminated_NotDealtBlinds_NotInTurnOrder()
    {
        var players = new List<Player>
        {
            new() { PlayerId = "p1", Name = "Alice", Stack = 0, IsAwaitingRebuy = true },
            new() { PlayerId = "p2", Name = "Bob",   Stack = 500 },
            new() { PlayerId = "p3", Name = "Cara",  Stack = 500 },
        };
        var state = RawState(players, dealerIndex: 0);
        var afterCashOut = GameEngine.ApplyCashOut(state, "p1").Value!;

        // Drive the hand through a full betting round; p1 must never be the active player.
        var current = afterCashOut;
        for (var i = 0; i < 6 && current.IsHandActive; i++)
        {
            current.ActivePlayerTurnId.Should().NotBe("p1");
            var actor = current.ActivePlayerTurnId!;
            var player = current.Players.First(p => p.PlayerId == actor);
            var action = current.CurrentBet == player.CurrentBet ? PokerAction.Check : PokerAction.Call;
            current = GameEngine.ValidateAction(current, Action(actor, action)).Value!;
        }

        current.Players.First(p => p.PlayerId == "p1").CurrentBet.Should().Be(0);
    }

    [Fact]
    public void Eliminated_DealerRotation_SkipsEliminated()
    {
        var players = new List<Player>
        {
            new() { PlayerId = "p1", Name = "Alice", Stack = 500 },
            new() { PlayerId = "p2", Name = "Bob",   Stack = 0, IsAwaitingRebuy = true },
            new() { PlayerId = "p3", Name = "Cara",  Stack = 500 },
        };
        var state = RawState(players, dealerIndex: 0);
        var afterCashOut = GameEngine.ApplyCashOut(state, "p2").Value!;

        afterCashOut.Players[afterCashOut.DealerIndex].IsEliminated.Should().BeFalse();

        // Resolve a couple more hands and confirm the dealer never lands on the eliminated seat.
        var next = GameEngine.ResolveShowdown(afterCashOut, "p1");
        next.Players[next.DealerIndex].IsEliminated.Should().BeFalse();
        next.Players[next.DealerIndex].PlayerId.Should().NotBe("p2");

        var next2 = GameEngine.ResolveShowdown(next, "p3");
        next2.Players[next2.DealerIndex].IsEliminated.Should().BeFalse();
        next2.Players[next2.DealerIndex].PlayerId.Should().NotBe("p2");
    }

    [Fact]
    public void ApplyCashOut_UnknownPlayer_ReturnsFailure()
    {
        var state = HeadsUpState(dealerIndex: 0);

        var result = GameEngine.ApplyCashOut(state, "ghost");

        result.IsSuccess.Should().BeFalse();
    }

    [Fact]
    public void ApplyCashOut_PlayerNotAwaitingRebuy_ReturnsFailure()
    {
        var state = HeadsUpState(dealerIndex: 0);

        var result = GameEngine.ApplyCashOut(state, "p1");

        result.IsSuccess.Should().BeFalse();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Heads-up: last seated player waits for others; eliminated players can buy back in
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void HeadsUp_OneCashesOut_GameWaitsForPlayers_EliminatedCanBuyBackIn()
    {
        var players = new List<Player>
        {
            new() { PlayerId = "p1", Name = "Alice", Stack = 0, IsAwaitingRebuy = true },
            new() { PlayerId = "p2", Name = "Bob",   Stack = 2000 },
        };
        var state = RawState(players, dealerIndex: 0);

        var afterCashOut = GameEngine.ApplyCashOut(state, "p1").Value!;
        afterCashOut.IsHandActive.Should().BeFalse("only one seated player remains - waiting for another to join or buy back in");

        var afterBuyback = GameEngine.ApplyRebuy(afterCashOut, "p1", 1000);

        afterBuyback.IsSuccess.Should().BeTrue();
        var newState = afterBuyback.Value!;
        var p1 = newState.Players.First(p => p.PlayerId == "p1");
        p1.IsEliminated.Should().BeFalse();
        newState.IsHandActive.Should().BeTrue("both seats are filled again");
    }

    [Fact]
    public void Rebuy_ByEliminatedPlayer_ReseatsThem()
    {
        var players = new List<Player>
        {
            new() { PlayerId = "p1", Name = "Alice", Stack = 0, IsEliminated = true },
            new() { PlayerId = "p2", Name = "Bob",   Stack = 2000 },
        };
        var state = RawState(players, dealerIndex: 0);

        var result = GameEngine.ApplyRebuy(state, "p1", 1000);

        result.IsSuccess.Should().BeTrue();
        var p1 = result.Value!.Players.First(p => p.PlayerId == "p1");
        p1.IsEliminated.Should().BeFalse();
        p1.Stack.Should().BeGreaterThan(0);
    }
}
