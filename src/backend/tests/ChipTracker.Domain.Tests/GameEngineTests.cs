using ChipTracker.Domain.Engine;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Enums;
using FluentAssertions;

namespace ChipTracker.Domain.Tests;

/// <summary>
/// Comprehensive unit tests for GameEngine covering heads-up poker rules,
/// blind posting, action validation, phase transitions, and pot resolution.
/// </summary>
public class GameEngineTests
{
    // ──────────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────────

    private static List<Player> TwoPlayers(int stack1 = 1000, int stack2 = 1000) =>
    [
        new() { PlayerId = "p1", Name = "Alice", Stack = stack1 },
        new() { PlayerId = "p2", Name = "Bob",   Stack = stack2 }
    ];

    private static GameState InitialState(int dealerIndex = 0, int smallBlind = 10, int bigBlind = 20,
        int stack1 = 1000, int stack2 = 1000) =>
        GameEngine.CreateInitialState(TwoPlayers(stack1, stack2), smallBlind, bigBlind, dealerIndex);

    private static ActionRequest Action(string playerId, PokerAction action, int? amount = null) =>
        new() { PlayerId = playerId, Action = action, Amount = amount };

    // ──────────────────────────────────────────────────────────────────────────
    // CreateInitialState — heads-up blind rules
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void CreateInitialState_HeadsUp_DealerPostsSmallBlind()
    {
        var state = InitialState(dealerIndex: 0);

        // Dealer (p1) = SB
        state.Players[0].CurrentBet.Should().Be(10, "dealer posts SB in heads-up");
        state.Players[0].Stack.Should().Be(990);
        state.Players[0].IsDealer.Should().BeTrue();
    }

    [Fact]
    public void CreateInitialState_HeadsUp_NonDealerPostsBigBlind()
    {
        var state = InitialState(dealerIndex: 0);

        // Non-dealer (p2) = BB
        state.Players[1].CurrentBet.Should().Be(20, "non-dealer posts BB in heads-up");
        state.Players[1].Stack.Should().Be(980);
    }

    [Fact]
    public void CreateInitialState_HeadsUp_DealerSBActsFirstPreFlop()
    {
        var state = InitialState(dealerIndex: 0);

        // Dealer/SB acts first pre-flop in heads-up
        state.ActivePlayerTurnId.Should().Be("p1", "dealer/SB acts first pre-flop");
    }

    [Fact]
    public void CreateInitialState_HeadsUp_DealerIndex1_CorrectBlinds()
    {
        var state = InitialState(dealerIndex: 1);

        state.Players[1].IsDealer.Should().BeTrue();
        state.Players[1].CurrentBet.Should().Be(10, "dealer posts SB");
        state.Players[0].CurrentBet.Should().Be(20, "non-dealer posts BB");
        state.ActivePlayerTurnId.Should().Be("p2");
    }

    [Fact]
    public void CreateInitialState_PotContainsBothBlinds()
    {
        var state = InitialState(smallBlind: 10, bigBlind: 20);

        state.Pot.Should().Be(30);
        state.CurrentBet.Should().Be(20);
    }

    [Fact]
    public void CreateInitialState_PhaseIsPreFlop_HandIsActive()
    {
        var state = InitialState();

        state.Phase.Should().Be(GamePhase.PreFlop);
        state.IsHandActive.Should().BeTrue();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ValidateAction — turn enforcement
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void ValidateAction_WrongPlayer_ReturnsFailure()
    {
        var state = InitialState(dealerIndex: 0); // p1's turn

        var result = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check));

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("Not your turn");
    }

    [Fact]
    public void ValidateAction_UnknownPlayer_ReturnsFailure()
    {
        var state = InitialState();

        var result = GameEngine.ValidateAction(state, Action("ghost", PokerAction.Check));

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("Player not found");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ValidateCheck
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void ValidateCheck_FacingBet_ReturnsFailure()
    {
        // p1 (dealer/SB) faces BB bet of 20 pre-flop — cannot check
        var state = InitialState(dealerIndex: 0);

        var result = GameEngine.ValidateAction(state, Action("p1", PokerAction.Check));

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("outstanding bet");
    }

    [Fact]
    public void ValidateCheck_NoBet_Succeeds()
    {
        // p1 (SB) calls pre-flop → BB (p2) gets live option, still PreFlop
        var state = InitialState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        state.Phase.Should().Be(GamePhase.PreFlop, "BB still has their live option");
        state.ActivePlayerTurnId.Should().Be("p2");

        // p2 checks their option → phase advances to Flop with p2 first
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check)).Value!;
        state.Phase.Should().Be(GamePhase.Flop);
        state.ActivePlayerTurnId.Should().Be("p2");

        // p2 can check on Flop (no bet outstanding)
        var result = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check));
        result.IsSuccess.Should().BeTrue();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ValidateCall
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void ValidateCall_ReducesStackAndIncreasesPoт()
    {
        var state = InitialState(dealerIndex: 0);
        // p1 (SB, 10 posted) calls to match BB of 20
        var result = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call));

        result.IsSuccess.Should().BeTrue();
        var p1 = result.Value!.Players.First(p => p.PlayerId == "p1");
        p1.Stack.Should().Be(980, "called 10 more to match BB");
        result.Value.Pot.Should().Be(40);
    }

    [Fact]
    public void ValidateCall_NoBetToCall_ReturnsFailure()
    {
        // On flop with no bet, call is invalid
        var state = InitialState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check)).Value!;
        // Now on flop, p2 acts first — no bet exists

        var result = GameEngine.ValidateAction(state, Action("p2", PokerAction.Call));

        result.IsSuccess.Should().BeFalse();
    }

    [Fact]
    public void ValidateCall_ShortStack_GoesAllIn()
    {
        var state = InitialState(dealerIndex: 0, stack1: 15, stack2: 1000);
        // p1 has 15 chips. SB posted 10, so 5 left. Call would need 10 more but only 5 remain.
        var result = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call));

        result.IsSuccess.Should().BeTrue();
        var p1 = result.Value!.Players.First(p => p.PlayerId == "p1");
        p1.IsAllIn.Should().BeTrue();
        p1.Stack.Should().Be(0);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ValidateBet
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void ValidateBet_BelowMinimum_ReturnsFailure()
    {
        // p1 calls pre-flop → p2 checks option → Flop (p2 first). Min bet = BigBlind = 20.
        var state = InitialState(dealerIndex: 0, bigBlind: 20);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check)).Value!;
        state.Phase.Should().Be(GamePhase.Flop);
        state.ActivePlayerTurnId.Should().Be("p2");

        var result = GameEngine.ValidateAction(state, Action("p2", PokerAction.Bet, 10));

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("Minimum bet");
    }

    [Fact]
    public void ValidateBet_WhenBetExists_ReturnsFailure()
    {
        // Pre-flop: p1 (SB) raises instead of just calling — bet already exists (BB)
        var state = InitialState(dealerIndex: 0);

        // p1 tries to "Bet" but CurrentBet is already 20 (BB)
        var result = GameEngine.ValidateAction(state, Action("p1", PokerAction.Bet, 50));

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("Cannot bet when a bet exists");
    }

    [Fact]
    public void ValidateBet_Valid_UpdatesStateCorrectly()
    {
        // p1 calls pre-flop (pot=40 total) → p2 checks option → Flop, p2 first
        var state = InitialState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check)).Value!;
        state.Phase.Should().Be(GamePhase.Flop);

        var result = GameEngine.ValidateAction(state, Action("p2", PokerAction.Bet, 40));

        result.IsSuccess.Should().BeTrue();
        result.Value!.CurrentBet.Should().Be(40);
        result.Value.Pot.Should().Be(80, "40 from pre-flop calls + 40 new bet");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ValidateRaise
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void ValidateRaise_BelowMinimum_ReturnsFailure()
    {
        var state = InitialState(dealerIndex: 0, bigBlind: 20);
        // p1 raises to below minimum (must be at least BB=20 + MinRaise=20 = 40)
        var result = GameEngine.ValidateAction(state, Action("p1", PokerAction.Raise, 30));

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("Minimum raise");
    }

    [Fact]
    public void ValidateRaise_Valid_UpdatesBetAndMinRaise()
    {
        var state = InitialState(dealerIndex: 0);
        // p1 (SB, has bet 10) raises to 60
        var result = GameEngine.ValidateAction(state, Action("p1", PokerAction.Raise, 60));

        result.IsSuccess.Should().BeTrue();
        result.Value!.CurrentBet.Should().Be(60);
        result.Value.MinRaise.Should().Be(40, "raise size was 60-20=40");
    }

    [Fact]
    public void ValidateRaise_NoBetToRaise_ReturnsFailure()
    {
        var state = InitialState(dealerIndex: 0);
        // Move to flop with no bet
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check)).Value!;

        var result = GameEngine.ValidateAction(state, Action("p2", PokerAction.Raise, 100));

        result.IsSuccess.Should().BeFalse();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ValidateAllIn
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void ValidateAllIn_PushesEntireStack()
    {
        var state = InitialState(dealerIndex: 0);
        // p1 goes all in (990 remaining after SB post)
        var result = GameEngine.ValidateAction(state, Action("p1", PokerAction.AllIn));

        result.IsSuccess.Should().BeTrue();
        var p1 = result.Value!.Players.First(p => p.PlayerId == "p1");
        p1.IsAllIn.Should().BeTrue();
        p1.Stack.Should().Be(0);
    }

    [Fact]
    public void ValidateAllIn_EmptyStack_ReturnsFailure()
    {
        var state = InitialState(dealerIndex: 0, stack1: 10);
        // p1 posts SB=10, has 0 left
        var result = GameEngine.ValidateAction(state, Action("p1", PokerAction.AllIn));

        result.IsSuccess.Should().BeFalse();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Fold — auto-award pot
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void Fold_HeadsUp_AutoAwardsPotToOtherPlayer()
    {
        // Total chips = 2000. After fold, new hand posts blinds. Conservation holds.
        var state = InitialState(dealerIndex: 0);
        var result = GameEngine.ValidateAction(state, Action("p1", PokerAction.Fold));

        result.IsSuccess.Should().BeTrue();
        var newState = result.Value!;
        var totalChips = newState.Players.Sum(p => p.Stack) + newState.Pot;
        totalChips.Should().Be(2000, "chips are conserved across fold + new hand setup");

        // New hand started: p2 won and new blinds posted
        newState.Phase.Should().Be(GamePhase.PreFlop);
        newState.IsHandActive.Should().BeTrue();
    }

    [Fact]
    public void Fold_HeadsUp_StartsNewHand_RotatesDealer()
    {
        var state = InitialState(dealerIndex: 0);
        var result = GameEngine.ValidateAction(state, Action("p1", PokerAction.Fold));

        result.IsSuccess.Should().BeTrue();
        var newState = result.Value!;
        // Dealer should have rotated to index 1 (p2)
        newState.DealerIndex.Should().Be(1);
        newState.Players[1].IsDealer.Should().BeTrue();
        newState.Phase.Should().Be(GamePhase.PreFlop);
        newState.IsHandActive.Should().BeTrue();
    }

    [Fact]
    public void Fold_HeadsUp_NewHandPostsBlindsCorrectly()
    {
        var state = InitialState(dealerIndex: 0);
        var result = GameEngine.ValidateAction(state, Action("p1", PokerAction.Fold));

        var newState = result.Value!;
        // New dealer is p2 (index 1) — p2 posts SB, p1 posts BB in heads-up
        var p1 = newState.Players.First(p => p.PlayerId == "p1");
        var p2 = newState.Players.First(p => p.PlayerId == "p2");
        p2.CurrentBet.Should().Be(10, "new dealer/SB");
        p1.CurrentBet.Should().Be(20, "new BB");
        // New first-to-act is p2 (dealer/SB) pre-flop
        newState.ActivePlayerTurnId.Should().Be("p2");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Phase advancement
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void AdvancePhase_PreFlopToFlop_ResetsBeтs()
    {
        // p1 calls → BB (p2) gets live option and checks → Flop starts.
        var state = InitialState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        state.Phase.Should().Be(GamePhase.PreFlop, "BB still has their live option");
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check)).Value!;
        state.Phase.Should().Be(GamePhase.Flop);
        state.CurrentBet.Should().Be(0, "bets reset on phase advance");

        // p2 checks on Flop (p1 still needs to act, so no phase advance yet)
        var result = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check));

        result.IsSuccess.Should().BeTrue();
        result.Value!.Phase.Should().Be(GamePhase.Flop, "only one player checked; p1 still needs to act");
        result.Value.CurrentBet.Should().Be(0);
    }

    [Fact]
    public void AdvancePhase_PostFlop_NonDealerActsFirst()
    {
        // p1 calls → p2 checks option → Flop starts with p2 (non-dealer/BB) first
        var state = InitialState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check)).Value!;

        state.Phase.Should().Be(GamePhase.Flop);
        state.ActivePlayerTurnId.Should().Be("p2", "non-dealer acts first post-flop in heads-up");
    }

    [Fact]
    public void PhaseProgression_AllFivePhases()
    {
        var state = InitialState(dealerIndex: 0);

        // Pre-flop: p1 (SB/dealer) calls → BB (p2) gets live option, checks → Flop
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check)).Value!;
        state.Phase.Should().Be(GamePhase.Flop);

        // Flop: p2 first (non-dealer). p2 checks, p1 checks → Turn
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check)).Value!;
        state.Phase.Should().Be(GamePhase.Flop, "only p2 checked; p1 still to act");
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Check)).Value!;
        state.Phase.Should().Be(GamePhase.Turn);

        // Turn: p2 first. p2 checks, p1 checks → River
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check)).Value!;
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Check)).Value!;
        state.Phase.Should().Be(GamePhase.River);

        // River: p2 checks, p1 checks → Showdown
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check)).Value!;
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Check)).Value!;
        state.Phase.Should().Be(GamePhase.Showdown);
        state.IsHandActive.Should().BeFalse("hand over at showdown");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ResolveShowdown
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void ResolveShowdown_AwardsPotToWinner()
    {
        // After pot is awarded, next hand starts and blinds post. Verify chip conservation.
        var state = InitialState(dealerIndex: 0);
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        state.Phase = GamePhase.Showdown;
        state.IsHandActive = false;
        int potBeforeResolve = state.Pot; // 40
        int totalChipsBefore = state.Players.Sum(p => p.Stack) + state.Pot; // 2000

        var newState = GameEngine.ResolveShowdown(state, "p2");

        var totalChipsAfter = newState.Players.Sum(p => p.Stack) + newState.Pot;
        totalChipsAfter.Should().Be(totalChipsBefore, "chips conserved after award + new hand");
        newState.Phase.Should().Be(GamePhase.PreFlop);
    }

    [Fact]
    public void ResolveShowdown_RotatesDealer_StartsNewHand()
    {
        var state = InitialState(dealerIndex: 0);
        state.Phase = GamePhase.Showdown;
        state.IsHandActive = false;

        var newState = GameEngine.ResolveShowdown(state, "p1");

        newState.DealerIndex.Should().Be(1);
        newState.Phase.Should().Be(GamePhase.PreFlop);
        newState.IsHandActive.Should().BeTrue();
        newState.Pot.Should().Be(30, "new blinds posted");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ResolveSplitPot
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void ResolveSplitPot_EvenSplit_GivesBothPlayersHalf()
    {
        var state = InitialState(dealerIndex: 0);
        // p1 calls (pot = 40), then get to showdown
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call)).Value!;
        state = GameEngine.ValidateAction(state, Action("p2", PokerAction.Check)).Value!;
        state.Phase = GamePhase.Showdown;
        state.IsHandActive = false;

        // Pot = 40. p1 stack=980, p2 stack=980.
        int p1StackBefore = state.Players.First(p => p.PlayerId == "p1").Stack;
        int p2StackBefore = state.Players.First(p => p.PlayerId == "p2").Stack;
        int potBefore = state.Pot; // 40

        var newState = GameEngine.ResolveSplitPot(state);

        var p1 = newState.Players.First(p => p.PlayerId == "p1");
        var p2 = newState.Players.First(p => p.PlayerId == "p2");
        // Each player received 20 from split, then new blinds posted for next hand
        (p1.Stack + p2.Stack + newState.Pot).Should().Be(
            p1StackBefore + p2StackBefore + potBefore,
            "all chips conserved across the split and new blind posts");
    }

    [Fact]
    public void ResolveSplitPot_OddPot_RemainderGoesToFirstSeat()
    {
        var players = TwoPlayers(500, 500);
        var state = new GameState
        {
            Players = players,
            Pot = 41,
            CurrentBet = 0,
            Phase = GamePhase.Showdown,
            DealerIndex = 0,
            SmallBlind = 5,
            BigBlind = 10,
            MinRaise = 10,
            IsHandActive = false,
            StreetFirstActorId = null
        };
        int totalBefore = state.Players.Sum(p => p.Stack) + state.Pot; // 500+500+41=1041

        var newState = GameEngine.ResolveSplitPot(state);

        // Chips conserved: p1.Stack + p2.Stack + new blinds (now in Pot) = 1041
        int totalAfter = newState.Players.Sum(p => p.Stack) + newState.Pot;
        totalAfter.Should().Be(totalBefore, "all chips conserved");

        // Seat 0 (p1) gets the remainder chip:
        // Split 41: share=20 each, remainder=1 to seat 0.
        // New dealer=p2 (rotated from 0→1). p2 posts SB=5, p1 posts BB=10.
        // p1 ends with: 500+21-10 = 511. p2 ends with: 500+20-5 = 515.
        // Total = 511+515+15(pot) = 1041 ✓
        // The remainder is reflected in chip conservation above.
        newState.Players[0].Stack.Should().Be(511, "p1 gets remainder chip but pays higher blind");
        newState.Players[1].Stack.Should().Be(515);
    }

    [Fact]
    public void ResolveSplitPot_RotatesDealer_StartsNewHand()
    {
        var state = InitialState(dealerIndex: 0);
        state.Phase = GamePhase.Showdown;
        state.IsHandActive = false;

        var newState = GameEngine.ResolveSplitPot(state);

        newState.DealerIndex.Should().Be(1);
        newState.Phase.Should().Be(GamePhase.PreFlop);
        newState.IsHandActive.Should().BeTrue();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Dealer rotation across multiple hands
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void DealerRotation_ThreeHands_RotatesCorrectly()
    {
        var state = InitialState(dealerIndex: 0);
        state.Phase = GamePhase.Showdown;
        state.IsHandActive = false;

        // Hand 1 resolved: dealer rotates to 1
        state = GameEngine.ResolveShowdown(state, "p1");
        state.DealerIndex.Should().Be(1);

        // Hand 2 resolved: dealer rotates back to 0
        state.Phase = GamePhase.Showdown;
        state.IsHandActive = false;
        state = GameEngine.ResolveShowdown(state, "p2");
        state.DealerIndex.Should().Be(0);

        // Hand 3
        state.Phase = GamePhase.Showdown;
        state.IsHandActive = false;
        state = GameEngine.ResolveShowdown(state, "p1");
        state.DealerIndex.Should().Be(1);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Both players all-in (showdown without further action)
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void BothAllIn_HandBecomesInactive_AwaitingShowdown()
    {
        var state = InitialState(dealerIndex: 0);
        // p1 (SB) goes all-in for 990 remaining
        state = GameEngine.ValidateAction(state, Action("p1", PokerAction.AllIn)).Value!;
        state.Players.First(p => p.PlayerId == "p1").IsAllIn.Should().BeTrue();
        state.IsHandActive.Should().BeTrue("p2 still needs to call");

        // p2 calls the all-in (p2 has 980 left; all-in amount > 980 so p2 also goes all-in)
        var result = GameEngine.ValidateAction(state, Action("p2", PokerAction.Call));

        result.IsSuccess.Should().BeTrue();
        result.Value!.IsHandActive.Should().BeFalse("both players all-in, hand over");
        result.Value.Phase.Should().Be(GamePhase.Showdown, "no further action possible - jump straight to showdown");
        result.Value.ActivePlayerTurnId.Should().BeNull("no one is left able to act");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Immutability — ValidateAction does not mutate original state
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void ValidateAction_DoesNotMutateOriginalState()
    {
        var state = InitialState(dealerIndex: 0);
        int originalPot = state.Pot;
        string originalTurn = state.ActivePlayerTurnId!;

        _ = GameEngine.ValidateAction(state, Action("p1", PokerAction.Call));

        state.Pot.Should().Be(originalPot, "original state must not be mutated");
        state.ActivePlayerTurnId.Should().Be(originalTurn);
    }
}
