using ChipTracker.Domain.Engine;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Enums;
using FluentAssertions;

namespace ChipTracker.Domain.Tests;

/// <summary>
/// Tests for betting-round completion, all-in runouts, uncalled-bet refunds, action guards,
/// and multi-player (3+) turn/phase behavior. These cover the reported bug where, after both
/// players in a heads-up hand went all-in, the action incorrectly stayed on the second player.
/// </summary>
public class BettingRoundTests
{
    // ──────────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────────

    private static List<Player> TwoPlayers(int stack1 = 1000, int stack2 = 1000) =>
    [
        new() { PlayerId = "p1", Name = "Alice", Stack = stack1 },
        new() { PlayerId = "p2", Name = "Bob",   Stack = stack2 }
    ];

    private static List<Player> ThreePlayers(int stack1 = 1000, int stack2 = 1000, int stack3 = 1000) =>
    [
        new() { PlayerId = "p1", Name = "Alice", Stack = stack1 },
        new() { PlayerId = "p2", Name = "Bob",   Stack = stack2 },
        new() { PlayerId = "p3", Name = "Cara",  Stack = stack3 }
    ];

    private static GameState HeadsUpState(int dealerIndex = 0, int smallBlind = 10, int bigBlind = 20,
        int stack1 = 1000, int stack2 = 1000) =>
        GameEngine.CreateInitialState(TwoPlayers(stack1, stack2), smallBlind, bigBlind, dealerIndex);

    private static GameState ThreeHandedState(int dealerIndex = 0, int smallBlind = 10, int bigBlind = 20,
        int stack1 = 1000, int stack2 = 1000, int stack3 = 1000) =>
        GameEngine.CreateInitialState(ThreePlayers(stack1, stack2, stack3), smallBlind, bigBlind, dealerIndex);

    private static ActionRequest Action(string playerId, PokerAction action, int? amount = null) =>
        new() { PlayerId = playerId, Action = action, Amount = amount };

    private static int TotalChips(GameState state) => state.Players.Sum(p => p.Stack) + state.Pot;

    // ──────────────────────────────────────────────────────────────────────────
    // Regression: heads-up, both players all-in on the first hand (reported bug)
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void HeadsUp_AllInThenCallAllIn_PhaseIsShowdown()
    {
        var totalBefore = TotalChips(HeadsUpState(dealerIndex: 0));
        var state = HeadsUpState(dealerIndex: 0);

        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.AllIn)).Value!;
        var result = GameEngine.ValidateAction(state, Action("p2", PokerAction.Call));

        result.IsSuccess.Should().BeTrue();
        result.Value!.Phase.Should().Be(GamePhase.Showdown, "no one can act further once both are all-in");
        TotalChips(result.Value).Should().Be(totalBefore);
    }

    [Fact]
    public void HeadsUp_AllInThenCallAllIn_HandInactive_AndNoActivePlayer()
    {
        var state = HeadsUpState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.AllIn)).Value!;
        var result = GameEngine.ValidateAction(state, Action("p2", PokerAction.Call));

        result.Value!.IsHandActive.Should().BeFalse();
        result.Value.ActivePlayerTurnId.Should().BeNull("nobody is waiting to act - the hand is over");
    }

    [Fact]
    public void HeadsUp_AllInThenCallAllIn_FurtherActionRejected()
    {
        var state = HeadsUpState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.AllIn)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Call)).Value!;

        // Neither player should be able to take any further action - this is exactly the bug
        // reported: the UI kept offering the second player fold/check/bet after both were all-in.
        var p2Attempt = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check));
        var p1Attempt = GameEngine.ValidateAction(state, Action("p1", PokerAction.Fold));

        p2Attempt.IsSuccess.Should().BeFalse();
        p1Attempt.IsSuccess.Should().BeFalse();
    }

    [Fact]
    public void HeadsUp_AllInCalledByCoveringPlayer_PhaseIsShowdown()
    {
        // p1 goes all-in for less than p2 has; p2 calls without needing to go all-in themselves.
        // Previously this deadlocked: turn wrapped back to p2 and the street never closed.
        var state = HeadsUpState(dealerIndex: 0, stack1: 500, stack2: 1000);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.AllIn)).Value!;

        var result = GameEngine.ValidateAction(state, Action("p2", PokerAction.Call));

        result.IsSuccess.Should().BeTrue();
        result.Value!.Phase.Should().Be(GamePhase.Showdown);
        result.Value.IsHandActive.Should().BeFalse();
        result.Value.ActivePlayerTurnId.Should().BeNull();
    }

    [Fact]
    public void HeadsUp_AllInCalledByCoveringPlayer_NoRefundWhenAmountsMatch()
    {
        var state = HeadsUpState(dealerIndex: 0, stack1: 500, stack2: 1000);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.AllIn)).Value!;

        var result = GameEngine.ValidateAction(state, Action("p2", PokerAction.Call));

        var p1 = result.Value!.Players.First(p => p.PlayerId == "p1");
        var p2 = result.Value.Players.First(p => p.PlayerId == "p2");
        p1.Stack.Should().Be(0);
        p2.Stack.Should().Be(500, "p2 called the exact amount p1 was all-in for, nothing uncalled");
        result.Value.Pot.Should().Be(1000);
    }

    [Fact]
    public void HeadsUp_ShortStackAllIn_CoveringPlayerRefundedExcess()
    {
        // p1 is all-in for 500 total; p2 then also goes all-in for far more (2000 total).
        // The 1500 p2 put in beyond what p1 could ever match must be refunded.
        var state = HeadsUpState(dealerIndex: 0, stack1: 500, stack2: 2000);
        var totalBefore = TotalChips(state);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.AllIn)).Value!;

        var result = GameEngine.ValidateAction(state, Action("p2", PokerAction.AllIn));

        result.IsSuccess.Should().BeTrue();
        var newState = result.Value!;
        newState.Phase.Should().Be(GamePhase.Showdown);
        var p1 = newState.Players.First(p => p.PlayerId == "p1");
        var p2 = newState.Players.First(p => p.PlayerId == "p2");
        p1.Stack.Should().Be(0);
        p2.Stack.Should().Be(1500, "the 1500 uncalled excess above p1's all-in is refunded");
        newState.Pot.Should().Be(1000, "only the matched 500-vs-500 portion is contested");
        TotalChips(newState).Should().Be(totalBefore);
    }

    [Fact]
    public void AllIn_ChipsConserved_AcrossFullHand()
    {
        var state = HeadsUpState(dealerIndex: 0, stack1: 500, stack2: 2000);
        var totalBefore = TotalChips(state);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.AllIn)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.AllIn)).Value!;

        TotalChips(state).Should().Be(totalBefore);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Round-completion: aggression no longer requires a phantom extra action
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void HeadsUp_PostFlop_BetThenCall_AdvancesToNextStreet()
    {
        var state = HeadsUpState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check)).Value!;
        state.Phase.Should().Be(GamePhase.Flop);

        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Bet, 40)).Value!;
        var result = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call));

        result.IsSuccess.Should().BeTrue();
        result.Value!.Phase.Should().Be(GamePhase.Turn, "bet+call closes the street immediately");
    }

    [Fact]
    public void HeadsUp_PostFlop_BetRaiseCall_AdvancesToNextStreet()
    {
        var state = HeadsUpState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check)).Value!;

        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Bet, 40)).Value!;
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Raise, 120)).Value!;
        var result = GameEngine.ValidateAction(state, Action("p2", PokerAction.Call));

        result.IsSuccess.Should().BeTrue();
        result.Value!.Phase.Should().Be(GamePhase.Turn);
    }

    [Fact]
    public void HeadsUp_PreFlop_SBCalls_BBGetsOption_NotAdvancedYet()
    {
        var state = HeadsUpState(dealerIndex: 0);
        var result = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call));

        result.Value!.Phase.Should().Be(GamePhase.PreFlop, "BB still has a live option");
        result.Value.ActivePlayerTurnId.Should().Be("p2");
    }

    [Fact]
    public void HeadsUp_PreFlop_SBCalls_BBChecks_AdvancesToFlop()
    {
        var state = HeadsUpState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        var result = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check));

        result.Value!.Phase.Should().Be(GamePhase.Flop);
    }

    [Fact]
    public void HeadsUp_PreFlop_SBCalls_BBRaises_SBMustActAgain()
    {
        var state = HeadsUpState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        var result = GameEngine.ValidateAction(state, Action("p2", PokerAction.Raise, 60));

        result.IsSuccess.Should().BeTrue();
        result.Value!.Phase.Should().Be(GamePhase.PreFlop, "p1 must respond to the raise");
        result.Value.ActivePlayerTurnId.Should().Be("p1");

        // p1 folding to the raise ends the hand (fold-to-one), proving the round had reopened.
        var afterFold = GameEngine.ValidateAction(result.Value, Action("p1", PokerAction.Fold));
        afterFold.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public void HeadsUp_PostFlop_CheckCheck_AdvancesToNextStreet()
    {
        var state = HeadsUpState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check)).Value!;
        state.Phase.Should().Be(GamePhase.Flop);

        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check)).Value!;
        var result = GameEngine.ValidateAction(state, Action("p1", PokerAction.Check));

        result.Value!.Phase.Should().Be(GamePhase.Turn);
    }

    [Fact]
    public void Raise_ReopensAction_ForPlayersWhoAlreadyActed()
    {
        var state = HeadsUpState(dealerIndex: 0);
        // p1 (SB) calls - p1 has now "acted" this street.
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;

        // p2 raises - this must reopen the action for p1, even though p1 already acted.
        var afterRaise = GameEngine.ValidateAction(state, Action("p2", PokerAction.Raise, 60)).Value!;
        afterRaise.ActivePlayerTurnId.Should().Be("p1");
        afterRaise.Phase.Should().Be(GamePhase.PreFlop);

        // p1 calling the raise now closes the street.
        var result = GameEngine.ValidateAction(afterRaise, Action("p1", PokerAction.Call));
        result.Value!.Phase.Should().Be(GamePhase.Flop);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Action guards
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void ValidateAction_HandNotActive_ReturnsFailure()
    {
        var state = HeadsUpState(dealerIndex: 0);
        state.IsHandActive = false;

        var result = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call));

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("not active");
    }

    [Fact]
    public void ValidateAction_PhaseShowdown_ReturnsFailure()
    {
        var state = HeadsUpState(dealerIndex: 0);
        state.Phase = GamePhase.Showdown;

        var result = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call));

        result.IsSuccess.Should().BeFalse();
    }

    [Fact]
    public void ValidateAction_FoldedPlayer_ReturnsFailure()
    {
        var state = HeadsUpState(dealerIndex: 0);
        state.Players.First(p => p.PlayerId == "p1").HasFolded = true;

        var result = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call));

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("folded");
    }

    [Fact]
    public void ValidateAction_AllInPlayer_ReturnsFailure()
    {
        var state = HeadsUpState(dealerIndex: 0);
        state.Players.First(p => p.PlayerId == "p1").IsAllIn = true;

        var result = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call));

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("all-in");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Multi-player (3-handed) coverage
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void ThreePlayers_PostBlinds_SBIsDealerPlusOne_BBIsDealerPlusTwo()
    {
        var state = ThreeHandedState(dealerIndex: 0);

        state.Players[1].CurrentBet.Should().Be(10, "dealer+1 posts SB");
        state.Players[2].CurrentBet.Should().Be(20, "dealer+2 posts BB");
    }

    [Fact]
    public void ThreePlayers_PreFlop_UtgActsFirst()
    {
        var state = ThreeHandedState(dealerIndex: 0);

        state.ActivePlayerTurnId.Should().Be("p1", "player after the big blind acts first pre-flop");
    }

    [Fact]
    public void ThreePlayers_PostFlop_SBActsFirst()
    {
        var state = ThreeHandedState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Call)).Value!;
        state = GameEngine.ValidateAction(state, Action("p3", PokerAction.Check)).Value!;

        state.Phase.Should().Be(GamePhase.Flop);
        state.ActivePlayerTurnId.Should().Be("p2", "first active player after the dealer acts first post-flop");
    }

    [Fact]
    public void ThreePlayers_Fold_HandContinuesBetweenRemainingTwo()
    {
        var state = ThreeHandedState(dealerIndex: 0);

        var result = GameEngine.ValidateAction(state, Action("p1", PokerAction.Fold));

        result.IsSuccess.Should().BeTrue();
        result.Value!.IsHandActive.Should().BeTrue("two players remain - no auto-award");
        result.Value.Phase.Should().Be(GamePhase.PreFlop);
        result.Value.ActivePlayerTurnId.Should().Be("p2");
    }

    [Fact]
    public void ThreePlayers_AdvanceTurn_SkipsFoldedPlayer()
    {
        var state = ThreeHandedState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Fold)).Value!;

        // p2 (SB) then folds too; turn must skip both folded players and land on... nobody but p3.
        var result = GameEngine.ValidateAction(state, Action("p2", PokerAction.Fold));

        result.IsSuccess.Should().BeTrue();
        result.Value!.IsHandActive.Should().BeTrue("p3 wins uncontested, new hand starts");
    }

    [Fact]
    public void ThreePlayers_AdvanceTurn_SkipsAllInPlayer()
    {
        var state = ThreeHandedState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.AllIn)).Value!;

        state.ActivePlayerTurnId.Should().Be("p2", "all-in p1 is skipped, action moves to SB");
    }

    [Fact]
    public void ThreePlayers_AllCall_AdvancesStreet()
    {
        var state = ThreeHandedState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Call)).Value!;
        var result = GameEngine.ValidateAction(state, Action("p3", PokerAction.Check));

        result.Value!.Phase.Should().Be(GamePhase.Flop);
    }

    [Fact]
    public void ThreePlayers_TwoAllIn_ThirdFolds_PhaseIsShowdown()
    {
        var state = ThreeHandedState(dealerIndex: 0);
        var totalBefore = TotalChips(state);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.AllIn)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.AllIn)).Value!;

        var result = GameEngine.ValidateAction(state, Action("p3", PokerAction.Fold));

        result.IsSuccess.Should().BeTrue();
        result.Value!.Phase.Should().Be(GamePhase.Showdown);
        result.Value.IsHandActive.Should().BeFalse();
        TotalChips(result.Value).Should().Be(totalBefore);
    }

    [Fact]
    public void ThreePlayers_OneAllIn_OthersCall_StreetAdvances_AllInPlayerSkipped()
    {
        var state = ThreeHandedState(dealerIndex: 0, stack1: 15);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.AllIn)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Call)).Value!;

        var result = GameEngine.ValidateAction(state, Action("p3", PokerAction.Check));

        result.IsSuccess.Should().BeTrue();
        result.Value!.Phase.Should().Be(GamePhase.Flop, "betting is settled once the two able-to-act players match");
        result.Value.ActivePlayerTurnId.Should().Be("p2", "p1 is all-in and must be skipped as first-actor");
    }

    [Fact]
    public void ThreePlayers_AllThreeAllIn_PhaseIsShowdown()
    {
        var state = ThreeHandedState(dealerIndex: 0);
        var totalBefore = TotalChips(state);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.AllIn)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.AllIn)).Value!;

        var result = GameEngine.ValidateAction(state, Action("p3", PokerAction.AllIn));

        result.IsSuccess.Should().BeTrue();
        result.Value!.Phase.Should().Be(GamePhase.Showdown);
        result.Value.ActivePlayerTurnId.Should().BeNull();
        TotalChips(result.Value).Should().Be(totalBefore);
    }

    [Fact]
    public void ThreePlayers_AdvancePhase_FirstActorSkipsFoldedAndAllIn()
    {
        var state = ThreeHandedState(dealerIndex: 0);
        // p1 (UTG) calls, p2 (SB) folds, p3 (BB) checks their option -> advance to Flop.
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Fold)).Value!;
        var result = GameEngine.ValidateAction(state, Action("p3", PokerAction.Check));

        result.Value!.Phase.Should().Be(GamePhase.Flop);
        result.Value.ActivePlayerTurnId.Should().Be("p3", "dealer+1 (p2) folded, so p3 is the next eligible actor");
    }
}
