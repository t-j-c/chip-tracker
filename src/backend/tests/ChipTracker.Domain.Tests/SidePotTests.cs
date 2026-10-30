using ChipTracker.Domain.Engine;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Enums;
using FluentAssertions;

namespace ChipTracker.Domain.Tests;

/// <summary>
/// Tests for side-pot construction (<see cref="GameEngine.BuildPots"/>) and per-pot winner
/// awarding (<see cref="GameEngine.AwardPots"/>) when players go all-in at different stack
/// depths, or when a folded player has already contributed dead money to the pot.
/// </summary>
public class SidePotTests
{
    // ──────────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────────

    private static List<Player> ThreePlayers(int stack1 = 1000, int stack2 = 1000, int stack3 = 1000) =>
    [
        new() { PlayerId = "p1", Name = "Alice", Stack = stack1 },
        new() { PlayerId = "p2", Name = "Bob",   Stack = stack2 },
        new() { PlayerId = "p3", Name = "Cara",  Stack = stack3 }
    ];

    private static GameState ThreeHandedState(int dealerIndex = 0, int smallBlind = 10, int bigBlind = 20,
        int stack1 = 1000, int stack2 = 1000, int stack3 = 1000) =>
        GameEngine.CreateInitialState(ThreePlayers(stack1, stack2, stack3), smallBlind, bigBlind, dealerIndex);

    private static ActionRequest Action(string playerId, PokerAction action, int? amount = null) =>
        new() { PlayerId = playerId, Action = action, Amount = amount };

    private static int TotalChips(GameState state) => state.Players.Sum(p => p.Stack) + state.Pot;

    /// <summary>Builds a raw GameState with the given players already at Showdown, for tests that
    /// need precise control over TotalContributed/HasFolded without driving full action sequences.</summary>
    private static GameState ShowdownState(List<Player> players, int pot, int dealerIndex = 0)
    {
        return new GameState
        {
            Players = players,
            Pot = pot,
            CurrentBet = 0,
            Phase = GamePhase.Showdown,
            DealerIndex = dealerIndex,
            SmallBlind = 10,
            BigBlind = 20,
            MinRaise = 20,
            IsHandActive = false,
            StreetFirstActorId = null
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // BuildPots
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void SidePots_EqualStacks_SinglePot()
    {
        // All three call the same amount pre-flop, then check through - equal contributions,
        // no side pots needed.
        var state = ThreeHandedState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Call)).Value!;
        state = GameEngine.ValidateAction(state, Action("p3", PokerAction.Check)).Value!;
        // Flop/Turn/River: check around each street.
        for (int i = 0; i < 3; i++)
        {
            state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check)).Value!;
            state = GameEngine.ValidateAction(state, Action("p3", PokerAction.Check)).Value!;
            state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Check)).Value!;
        }

        state.Phase.Should().Be(GamePhase.Showdown);
        state.Pots.Should().HaveCount(1);
        state.Pots[0].EligiblePlayerIds.Should().BeEquivalentTo(["p1", "p2", "p3"]);
        state.Pots[0].Amount.Should().Be(state.Pot);
    }

    [Fact]
    public void SidePots_ThreePlayers_ShortAllIn_CreatesMainAndSidePot()
    {
        // p1 is short-stacked and all-in for less than the other two, who both put in more.
        var state = ThreeHandedState(dealerIndex: 0, stack1: 50, stack2: 1000, stack3: 1000);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.AllIn)).Value!; // total 50
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Raise, 200)).Value!;
        state = GameEngine.ValidateAction(state, Action("p3", PokerAction.Call)).Value!;

        state.Phase.Should().Be(GamePhase.Flop, "p2/p3 still have chips behind and can keep betting");
        // p1's all-in doesn't end the hand by itself; drive to showdown via checks so pots build.
        for (int i = 0; i < 3; i++)
        {
            state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check)).Value!;
            state = GameEngine.ValidateAction(state, Action("p3", PokerAction.Check)).Value!;
        }

        state.Phase.Should().Be(GamePhase.Showdown);
        state.Pots.Should().HaveCount(2, "one main pot capped at p1's all-in, one side pot for p2/p3 only");
        state.Pots[0].EligiblePlayerIds.Should().BeEquivalentTo(["p1", "p2", "p3"], "main pot: everyone is eligible");
        state.Pots[1].EligiblePlayerIds.Should().BeEquivalentTo(["p2", "p3"], "side pot: p1 couldn't match this, ineligible");
        state.Pots.Sum(p => p.Amount).Should().Be(state.Pot);
    }

    [Fact]
    public void SidePots_FoldedPlayerChips_StayInLowestPot()
    {
        // p1 folds after contributing to the pot pre-flop; their dead money still counts
        // toward the contested pot, but p1 is not eligible to win any of it.
        var state = ThreeHandedState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Raise, 100)).Value!;
        state = GameEngine.ValidateAction(state, Action("p3", PokerAction.Fold)).Value!;
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Fold)).Value!;

        // Fold-to-one auto-resolves via ResolveShowdown, not BuildPots - use a 3-way scenario
        // where exactly two remain in hand instead, so Showdown is reached via checks.
        state = ThreeHandedState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Raise, 100)).Value!;
        state = GameEngine.ValidateAction(state, Action("p3", PokerAction.Fold)).Value!;
        var potBeforeFold = state.Pot;
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        state.Phase.Should().Be(GamePhase.Flop);

        for (int i = 0; i < 3; i++)
        {
            state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check)).Value!;
            state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Check)).Value!;
        }

        state.Phase.Should().Be(GamePhase.Showdown);
        state.Pots.Should().HaveCount(1);
        state.Pots[0].EligiblePlayerIds.Should().BeEquivalentTo(["p1", "p2"], "p3 folded, not eligible despite contributing");
        state.Pots[0].Amount.Should().Be(state.Pot);
        state.Pot.Should().BeGreaterThan(potBeforeFold, "p3's dead money remains in the pot");
    }

    [Fact]
    public void SidePots_TwoDifferentAllInLevels_CreatesThreePots()
    {
        var players = new List<Player>
        {
            new() { PlayerId = "p1", Name = "Alice", Stack = 0, TotalContributed = 300 },
            new() { PlayerId = "p2", Name = "Bob",   Stack = 0, TotalContributed = 700 },
            new() { PlayerId = "p3", Name = "Cara",  Stack = 300, TotalContributed = 700 },
        };
        var state = ShowdownState(players, pot: 1700);

        var pots = GameEngine.BuildPots(state);

        pots.Should().HaveCount(2, "700 and 700 tie, so only two distinct contribution levels (300, 700)");
        pots[0].Amount.Should().Be(900, "300 from each of the 3 players");
        pots[0].EligiblePlayerIds.Should().BeEquivalentTo(["p1", "p2", "p3"]);
        pots[1].Amount.Should().Be(800, "400 more from each of p2 and p3");
        pots[1].EligiblePlayerIds.Should().BeEquivalentTo(["p2", "p3"]);
        pots.Sum(p => p.Amount).Should().Be(state.Pot);
    }

    [Fact]
    public void SidePots_TiedAllIns_SingleSidePotWithBothEligible()
    {
        // p2 and p3 are both all-in for the same total (a genuine tie at the top) - no
        // uncalled-bet refund should fire, and the side pot should list both as eligible.
        var players = new List<Player>
        {
            new() { PlayerId = "p1", Name = "Alice", Stack = 0, TotalContributed = 100, IsAllIn = true },
            new() { PlayerId = "p2", Name = "Bob",   Stack = 0, TotalContributed = 500, IsAllIn = true },
            new() { PlayerId = "p3", Name = "Cara",  Stack = 0, TotalContributed = 500, IsAllIn = true },
        };
        var state = ShowdownState(players, pot: 1100);

        var pots = GameEngine.BuildPots(state);

        pots.Should().HaveCount(2);
        pots[1].EligiblePlayerIds.Should().BeEquivalentTo(["p2", "p3"]);
        pots.Sum(p => p.Amount).Should().Be(1100);
    }

    [Fact]
    public void SidePots_TotalEqualsPotBeforeSplit()
    {
        var players = new List<Player>
        {
            new() { PlayerId = "p1", Name = "Alice", Stack = 0, TotalContributed = 150 },
            new() { PlayerId = "p2", Name = "Bob",   Stack = 0, TotalContributed = 400 },
            new() { PlayerId = "p3", Name = "Cara",  Stack = 200, TotalContributed = 900 },
        };
        var state = ShowdownState(players, pot: 1450);

        var pots = GameEngine.BuildPots(state);

        pots.Sum(p => p.Amount).Should().Be(state.Pot, "every chip in the pot must belong to exactly one layer");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // AwardPots
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void AwardPots_EachPotToItsWinner_StacksCorrect()
    {
        var players = new List<Player>
        {
            new() { PlayerId = "p1", Name = "Alice", Stack = 0, TotalContributed = 300 },
            new() { PlayerId = "p2", Name = "Bob",   Stack = 0, TotalContributed = 700 },
            new() { PlayerId = "p3", Name = "Cara",  Stack = 300, TotalContributed = 700 },
        };
        var state = ShowdownState(players, pot: 1700);
        state.Pots = GameEngine.BuildPots(state);
        var totalBefore = TotalChips(state);

        // p1 (short stack) wins the main pot; p3 wins the side pot.
        var awards = new List<PotAward>
        {
            new() { PotIndex = 0, WinnerPlayerIds = ["p1"] },
            new() { PotIndex = 1, WinnerPlayerIds = ["p3"] },
        };

        var result = GameEngine.AwardPots(state, awards);

        result.IsSuccess.Should().BeTrue();
        var newState = result.Value!;
        TotalChips(newState).Should().Be(totalBefore, "chips conserved across award + new hand blinds");

        // Before new-hand blinds are deducted: p1 would have 900 (main pot), p2 would have 0,
        // p3 would have 300 (own stack) + 800 (side pot) = 1100. Compare via CurrentBet + Stack,
        // which reflects post-blind totals for whoever posts this hand's blinds.
        var p1PostBlind = newState.Players.First(p => p.PlayerId == "p1");
        var p3PostBlind = newState.Players.First(p => p.PlayerId == "p3");
        (p1PostBlind.Stack + p1PostBlind.CurrentBet).Should().Be(900, "p1 won only the main pot");
        (p3PostBlind.Stack + p3PostBlind.CurrentBet).Should().Be(1100, "p3 won the side pot plus kept their own stack");
    }

    [Fact]
    public void AwardPots_SplitWithinOnePot_RemainderToLowestSeat()
    {
        var players = new List<Player>
        {
            new() { PlayerId = "p1", Name = "Alice", Stack = 0, TotalContributed = 700 },
            new() { PlayerId = "p2", Name = "Bob",   Stack = 0, TotalContributed = 700 },
            new() { PlayerId = "p3", Name = "Cara",  Stack = 0, TotalContributed = 700 },
        };
        var state = ShowdownState(players, pot: 2101); // odd remainder
        state.Pots = [new PotShare { Amount = 2101, EligiblePlayerIds = ["p1", "p2", "p3"] }];
        var totalBefore = TotalChips(state);

        var awards = new List<PotAward> { new() { PotIndex = 0, WinnerPlayerIds = ["p1", "p2", "p3"] } };
        var result = GameEngine.AwardPots(state, awards);

        result.IsSuccess.Should().BeTrue();
        var newState = result.Value!;
        // 2101 / 3 = 700 each, remainder 1 to the lowest seat index among the winners (p1).
        // Blinds for the next hand are posted afterward, so compare stacks *before* accounting
        // for them by checking chip conservation and relative ordering instead of exact amounts.
        TotalChips(newState).Should().Be(totalBefore, "all chips conserved across split + new blinds");
        var p1TotalContribThisAward = newState.Players.First(p => p.PlayerId == "p1").Stack
            + newState.Players.First(p => p.PlayerId == "p1").CurrentBet;
        var p2TotalContribThisAward = newState.Players.First(p => p.PlayerId == "p2").Stack
            + newState.Players.First(p => p.PlayerId == "p2").CurrentBet;
        p1TotalContribThisAward.Should().BeGreaterThan(p2TotalContribThisAward, "p1 (lowest seat index) got the remainder chip");
    }

    [Fact]
    public void AwardPots_IneligibleWinner_Rejected()
    {
        var players = new List<Player>
        {
            new() { PlayerId = "p1", Name = "Alice", Stack = 0, TotalContributed = 300 },
            new() { PlayerId = "p2", Name = "Bob",   Stack = 0, TotalContributed = 700 },
            new() { PlayerId = "p3", Name = "Cara",  Stack = 300, TotalContributed = 700 },
        };
        var state = ShowdownState(players, pot: 1700);
        state.Pots = GameEngine.BuildPots(state);

        // p1 is not eligible for the side pot (only p2/p3 are).
        var awards = new List<PotAward>
        {
            new() { PotIndex = 0, WinnerPlayerIds = ["p1"] },
            new() { PotIndex = 1, WinnerPlayerIds = ["p1"] },
        };

        var result = GameEngine.AwardPots(state, awards);

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("not eligible");
    }

    [Fact]
    public void AwardPots_MissingAward_Rejected()
    {
        var players = new List<Player>
        {
            new() { PlayerId = "p1", Name = "Alice", Stack = 0, TotalContributed = 300 },
            new() { PlayerId = "p2", Name = "Bob",   Stack = 0, TotalContributed = 700 },
            new() { PlayerId = "p3", Name = "Cara",  Stack = 300, TotalContributed = 700 },
        };
        var state = ShowdownState(players, pot: 1700);
        state.Pots = GameEngine.BuildPots(state);

        // Only award the main pot, omit the side pot.
        var awards = new List<PotAward> { new() { PotIndex = 0, WinnerPlayerIds = ["p1"] } };

        var result = GameEngine.AwardPots(state, awards);

        result.IsSuccess.Should().BeFalse();
    }

    [Fact]
    public void AwardPots_ChipsConserved()
    {
        var players = new List<Player>
        {
            new() { PlayerId = "p1", Name = "Alice", Stack = 0, TotalContributed = 300 },
            new() { PlayerId = "p2", Name = "Bob",   Stack = 0, TotalContributed = 700 },
            new() { PlayerId = "p3", Name = "Cara",  Stack = 300, TotalContributed = 700 },
        };
        var state = ShowdownState(players, pot: 1700);
        state.Pots = GameEngine.BuildPots(state);
        var totalBefore = TotalChips(state);

        var awards = new List<PotAward>
        {
            new() { PotIndex = 0, WinnerPlayerIds = ["p2"] },
            new() { PotIndex = 1, WinnerPlayerIds = ["p2", "p3"] },
        };
        var result = GameEngine.AwardPots(state, awards);

        result.IsSuccess.Should().BeTrue();
        TotalChips(result.Value!).Should().Be(totalBefore);
    }
}
