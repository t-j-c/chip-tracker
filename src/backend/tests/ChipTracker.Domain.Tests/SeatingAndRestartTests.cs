using ChipTracker.Domain.Engine;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Enums;
using FluentAssertions;

namespace ChipTracker.Domain.Tests;

/// <summary>
/// Admin seating order (pending until the next hand while one is in progress, never undone)
/// and the "restart hand" override (refund everything committed this hand, same dealer,
/// re-post blinds, not undoable).
/// </summary>
public class SeatingAndRestartTests
{
    private static List<Player> ThreePlayers() =>
    [
        new() { PlayerId = "p1", Name = "Alice", Stack = 1000 },
        new() { PlayerId = "p2", Name = "Bob",   Stack = 1000 },
        new() { PlayerId = "p3", Name = "Cara",  Stack = 1000 }
    ];

    // Dealer p1, SB p2, BB p3, p1 first to act.
    private static GameState ThreeHanded() => GameEngine.CreateInitialState(ThreePlayers(), 10, 20, dealerIndex: 0);

    private static GameState Act(GameState state, string playerId, PokerAction action, int? amount = null) =>
        GameEngine.ValidateAction(state, new ActionRequest { PlayerId = playerId, Action = action, Amount = amount }).Value!;

    private static string[] Order(GameState state) => state.Players.Select(p => p.PlayerId).ToArray();

    private static string DealerId(GameState state) => state.Players[state.DealerIndex].PlayerId;

    private static int TotalChips(GameState state) => state.Players.Sum(p => p.Stack) + state.Pot;

    private static GameRoom StartedRoom()
    {
        var room = new GameRoom { RoomCode = "ABC123", Players = ThreePlayers(), SmallBlind = 10, BigBlind = 20 };
        room.CurrentState = GameEngine.CreateInitialState(room.Players, 10, 20, dealerIndex: 0);
        room.PushState();
        return room;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Seating order
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void SetSeatOrder_BeforeStart_ReordersRoomPlayers()
    {
        var room = new GameRoom { Players = ThreePlayers() };

        room.SetSeatOrder(["p3", "p1", "p2"], "p1").Should().BeTrue();

        room.Players.Select(p => p.PlayerId).Should().Equal("p3", "p1", "p2");
    }

    [Fact]
    public void ApplySeatOrder_BetweenHands_AppliesNow_DealerStaysWithSamePlayer()
    {
        var state = new GameState { Players = ThreePlayers(), DealerIndex = 0, Phase = GamePhase.PreFlop };

        GameEngine.ApplySeatOrder(state, ["p2", "p3", "p1"], "p1").Should().BeTrue();

        Order(state).Should().Equal("p2", "p3", "p1");
        DealerId(state).Should().Be("p1");
        state.PendingSeatOrder.Should().BeNull();
        state.PendingLog.Should().ContainSingle(e => e.EntryType == ActivityEntryType.SeatsReordered && e.PlayerId == "p1");
    }

    [Fact]
    public void ApplySeatOrder_MidHand_PendingUntilNextHand_ThenButtonMovesInNewOrder()
    {
        var state = ThreeHanded();
        var turnBefore = state.ActivePlayerTurnId;

        GameEngine.ApplySeatOrder(state, ["p1", "p3", "p2"], "p1");

        Order(state).Should().Equal("p1", "p2", "p3");
        state.PendingSeatOrder.Should().Equal("p1", "p3", "p2");
        state.ActivePlayerTurnId.Should().Be(turnBefore);

        state = Act(state, "p1", PokerAction.Fold);
        state = Act(state, "p2", PokerAction.Fold);

        Order(state).Should().Equal("p1", "p3", "p2");
        state.PendingSeatOrder.Should().BeNull();
        DealerId(state).Should().Be("p3", "the button moves to the left of the previous dealer (p1) in the new order");
        state.Players.First(p => p.PlayerId == "p2").CurrentBet.Should().Be(10, "small blind");
        state.Players.First(p => p.PlayerId == "p1").CurrentBet.Should().Be(20, "big blind");
    }

    [Fact]
    public void ApplySeatOrder_NotAPermutation_Rejected()
    {
        var state = ThreeHanded();

        GameEngine.ApplySeatOrder(state, ["p1", "p2"]).Should().BeFalse();
        GameEngine.ApplySeatOrder(state, ["p1", "p1", "p2"]).Should().BeFalse();
        GameEngine.ApplySeatOrder(state, ["p1", "p2", "ghost"]).Should().BeFalse();

        state.PendingSeatOrder.Should().BeNull();
    }

    [Fact]
    public void Undo_DoesNotRevertSeatOrder()
    {
        var room = StartedRoom();
        room.PushState(Act(room.CurrentState!, "p1", PokerAction.Call));
        room.SetSeatOrder(["p1", "p3", "p2"], "p1");

        room.UndoLastAction().Should().BeTrue();

        room.Players.Select(p => p.PlayerId).Should().Equal("p1", "p3", "p2");
        room.CurrentState!.PendingSeatOrder.Should().Equal("p1", "p3", "p2");
        room.ActivityLog.Should().ContainSingle(e => e.EntryType == ActivityEntryType.SeatsReordered)
            .Which.IsUndone.Should().BeFalse();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Restart hand
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void RestartHand_RefundsBets_KeepsDealer_RepostsBlinds()
    {
        var state = ThreeHanded();
        state = Act(state, "p1", PokerAction.Raise, 100);
        state = Act(state, "p2", PokerAction.Call);
        var handNumber = state.HandNumber;

        var restarted = GameEngine.RestartHand(state, "p1").Value!;

        DealerId(restarted).Should().Be("p1");
        restarted.HandNumber.Should().Be(handNumber + 1);
        restarted.IsHandActive.Should().BeTrue();
        restarted.Phase.Should().Be(GamePhase.PreFlop);
        restarted.ActivePlayerTurnId.Should().Be("p1");
        restarted.Pot.Should().Be(30);
        restarted.Players.Select(p => p.Stack).Should().Equal(1000, 990, 980);
        restarted.PendingLog.Should().Contain(e => e.EntryType == ActivityEntryType.HandRestarted && e.PlayerId == "p1");
    }

    [Fact]
    public void RestartHand_AtShowdown_ReturnsPotToContributors()
    {
        var state = ThreeHanded();
        state = Act(state, "p1", PokerAction.AllIn);
        state = Act(state, "p2", PokerAction.Call);
        state = Act(state, "p3", PokerAction.Call);
        state.Phase.Should().Be(GamePhase.Showdown);

        var restarted = GameEngine.RestartHand(state, "p1").Value!;

        restarted.Pots.Should().BeEmpty();
        restarted.IsHandActive.Should().BeTrue();
        TotalChips(restarted).Should().Be(3000);
        restarted.Players.Select(p => p.Stack).Should().Equal(1000, 990, 980);
    }

    [Fact]
    public void RestartHand_RecoversStateLeftStuckByTheOldRebuyBug()
    {
        // Shape of a room persisted before the fix: hand marked active at Showdown, turn set.
        var state = ThreeHanded();
        state = Act(state, "p1", PokerAction.AllIn);
        state = Act(state, "p2", PokerAction.Call);
        state = Act(state, "p3", PokerAction.Call);
        state.IsHandActive = true;
        state.ActivePlayerTurnId = "p2";

        var restarted = GameEngine.RestartHand(state, "p1").Value!;

        restarted.Phase.Should().Be(GamePhase.PreFlop);
        restarted.IsHandActive.Should().BeTrue();
        restarted.ActivePlayerTurnId.Should().Be("p1");
        GameEngine.ValidateAction(restarted, new ActionRequest { PlayerId = "p1", Action = PokerAction.Call })
            .IsSuccess.Should().BeTrue();
        TotalChips(restarted).Should().Be(3000);
    }

    [Fact]
    public void RestartHand_AppliesPendingSeatOrder()
    {
        var state = ThreeHanded();
        GameEngine.ApplySeatOrder(state, ["p1", "p3", "p2"], "p1");

        var restarted = GameEngine.RestartHand(state, "p1").Value!;

        Order(restarted).Should().Equal("p1", "p3", "p2");
        restarted.PendingSeatOrder.Should().BeNull();
        DealerId(restarted).Should().Be("p1");
        restarted.Players.First(p => p.PlayerId == "p3").CurrentBet.Should().Be(10, "small blind in the new order");
    }

    [Fact]
    public void RestartHand_WhileWaitingOnRebuyDecision_Rejected()
    {
        var state = new GameState
        {
            Players =
            [
                new() { PlayerId = "p1", Name = "Alice", Stack = 0, IsAwaitingRebuy = true },
                new() { PlayerId = "p2", Name = "Bob", Stack = 2000 }
            ],
            Phase = GamePhase.PreFlop,
            SmallBlind = 10,
            BigBlind = 20
        };

        GameEngine.RestartHand(state, "p1").IsSuccess.Should().BeFalse("there is no hand to restart");
    }

    [Fact]
    public void PushCheckpoint_ClearsUndoHistoryAndPendingRequest()
    {
        var room = StartedRoom();
        room.PushState(Act(room.CurrentState!, "p1", PokerAction.Call));
        room.PendingUndoRequestBy = "p2";

        room.PushCheckpoint(GameEngine.RestartHand(room.CurrentState!, "p1").Value!);

        room.StateHistory.Should().BeEmpty();
        room.PendingUndoRequestBy.Should().BeNull();
        room.UndoLastAction().Should().BeFalse();
        room.ActivityLog.Should().Contain(e => e.EntryType == ActivityEntryType.HandRestarted);
    }
}
