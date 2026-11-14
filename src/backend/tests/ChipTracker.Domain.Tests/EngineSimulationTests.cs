using ChipTracker.Domain.Engine;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Enums;
using Xunit.Sdk;

namespace ChipTracker.Domain.Tests;

/// <summary>
/// Seeded random play through the room/engine the same way the command handlers drive it:
/// legal actions, showdown awards, rebuys and cash-outs, eliminated players buying back in at
/// any moment (mid-hand and at showdown), undo, admin restarts and seat reorders. After every
/// step the table must conserve chips and must never be stuck: a hand in progress always has a
/// player on turn who can act, and an idle table is always waiting on something resolvable.
/// </summary>
public class EngineSimulationTests
{
    private const int StartingStack = 200;
    private const int SmallBlind = 10;
    private const int BigBlind = 20;
    private const int Seeds = 150;
    private const int StepsPerSeed = 400;

    [Fact]
    public void RandomPlay_ConservesChips_AndNeverStalls()
    {
        for (var seed = 1; seed <= Seeds; seed++)
            RunSeed(seed);
    }

    private static void RunSeed(int seed)
    {
        var rng = new Random(seed);
        var playerCount = rng.Next(2, 7);
        var room = new GameRoom
        {
            RoomCode = "SIM000",
            StartingStack = StartingStack,
            SmallBlind = SmallBlind,
            BigBlind = BigBlind,
            CreatorPlayerId = "p0",
            Players = Enumerable.Range(0, playerCount)
                .Select(i => new Player { PlayerId = $"p{i}", Name = $"P{i}", Stack = StartingStack })
                .ToList()
        };
        room.CurrentState = GameEngine.CreateInitialState(room.Players, SmallBlind, BigBlind, dealerIndex: 0);
        room.PushState();

        // Expected chips on the table per state version, so undo (which can revert a rebuy) is checkable.
        var expectedTotals = new Dictionary<int, int> { [room.CurrentState.StateVersion] = playerCount * StartingStack };
        var total = expectedTotals[room.CurrentState.StateVersion];

        for (var step = 0; step < StepsPerSeed; step++)
        {
            var context = $"seed {seed}, step {step}";
            var state = room.CurrentState!;
            var roll = rng.NextDouble();
            var eliminated = state.Players.Where(p => p.IsEliminated).ToList();

            if (roll < 0.03)
            {
                var shuffled = room.Players.Select(p => p.PlayerId).OrderBy(_ => rng.Next()).ToList();
                if (!room.SetSeatOrder(shuffled, "p0"))
                    throw new XunitException($"{context}: valid seat order rejected");
            }
            else if (roll < 0.05)
            {
                var restart = GameEngine.RestartHand(state, "p0");
                var canDeal = state.Players.Count(p => !p.IsEliminated) >= 2
                    && !state.Players.Any(p => !p.IsEliminated && p.IsAwaitingRebuy);
                var handInProgress = state.IsHandActive || state.Phase == GamePhase.Showdown;
                if (restart.IsSuccess != (handInProgress || canDeal))
                    throw new XunitException($"{context}: restart {(restart.IsSuccess ? "accepted" : "rejected")} unexpectedly");
                if (restart.IsSuccess)
                {
                    room.PushCheckpoint(restart.Value!);
                    expectedTotals[room.CurrentState!.StateVersion] = total;
                }
            }
            else if (roll < 0.09 && eliminated.Count > 0)
            {
                var who = eliminated[rng.Next(eliminated.Count)];
                room.PushState(Expect(GameEngine.ApplyRebuy(state, who.PlayerId, StartingStack), context));
                total += StartingStack;
                expectedTotals[room.CurrentState!.StateVersion] = total;
            }
            else if (roll < 0.11 && room.StateHistory.Count > 0)
            {
                room.UndoLastAction();
                total = expectedTotals[room.CurrentState!.StateVersion];
            }
            else
            {
                var delta = Advance(room, rng, context);
                total += delta;
                expectedTotals[room.CurrentState!.StateVersion] = total;
            }

            AssertInvariants(room, total, context);
        }
    }

    /// <summary>Takes the table's natural next step. Returns the chips added (by a rebuy).</summary>
    private static int Advance(GameRoom room, Random rng, string context)
    {
        var state = room.CurrentState!;

        if (state.IsHandActive)
        {
            room.PushState(Expect(GameEngine.ValidateAction(state, RandomLegalAction(state, rng)), context));
            return 0;
        }

        if (state.Phase == GamePhase.Showdown)
        {
            var awards = state.Pots.Select((pot, i) => new PotAward
            {
                PotIndex = i,
                WinnerPlayerIds = rng.NextDouble() < 0.2
                    ? pot.EligiblePlayerIds.ToList()
                    : [pot.EligiblePlayerIds[rng.Next(pot.EligiblePlayerIds.Count)]]
            }).ToList();
            room.PushState(Expect(GameEngine.AwardPots(state.Clone(), awards), context));
            return 0;
        }

        var deciding = state.Players.FirstOrDefault(p => p.IsAwaitingRebuy);
        if (deciding != null)
        {
            if (rng.NextDouble() < 0.7)
            {
                room.PushState(Expect(GameEngine.ApplyRebuy(state, deciding.PlayerId, StartingStack), context));
                return StartingStack;
            }

            room.PushState(Expect(GameEngine.ApplyCashOut(state, deciding.PlayerId), context));
            return 0;
        }

        // Too few seated players: someone buys back in.
        var eliminated = state.Players.First(p => p.IsEliminated);
        room.PushState(Expect(GameEngine.ApplyRebuy(state, eliminated.PlayerId, StartingStack), context));
        return StartingStack;
    }

    private static ActionRequest RandomLegalAction(GameState state, Random rng)
    {
        var player = state.Players.First(p => p.PlayerId == state.ActivePlayerTurnId);
        var toCall = state.CurrentBet - player.CurrentBet;
        var options = new List<ActionRequest>
        {
            new() { PlayerId = player.PlayerId, Action = toCall == 0 ? PokerAction.Check : PokerAction.Call },
            new() { PlayerId = player.PlayerId, Action = toCall == 0 ? PokerAction.Check : PokerAction.Call },
            new() { PlayerId = player.PlayerId, Action = PokerAction.Fold }
        };

        if (rng.NextDouble() < 0.15)
            options.Add(new ActionRequest { PlayerId = player.PlayerId, Action = PokerAction.AllIn });

        if (state.CurrentBet == 0 && player.Stack >= state.BigBlind)
        {
            options.Add(new ActionRequest
                { PlayerId = player.PlayerId, Action = PokerAction.Bet, Amount = rng.Next(state.BigBlind, player.Stack + 1) });
        }

        var minRaiseTo = state.CurrentBet + state.MinRaise;
        var maxRaiseTo = player.Stack + player.CurrentBet;
        if (state.CurrentBet > 0 && maxRaiseTo >= minRaiseTo)
        {
            options.Add(new ActionRequest
                { PlayerId = player.PlayerId, Action = PokerAction.Raise, Amount = rng.Next(minRaiseTo, maxRaiseTo + 1) });
        }

        return options[rng.Next(options.Count)];
    }

    private static GameState Expect(Result<GameState> result, string context) =>
        result.IsSuccess ? result.Value! : throw new XunitException($"{context}: engine rejected a legal step: {result.Error}");

    private static void AssertInvariants(GameRoom room, int expectedTotal, string context)
    {
        var state = room.CurrentState!;
        void Check(bool condition, string message)
        {
            if (!condition)
                throw new XunitException($"{context}: {message}");
        }

        var onTable = state.Players.Sum(p => p.Stack) + state.Pot;
        Check(onTable == expectedTotal, $"chips not conserved: {onTable} on table, expected {expectedTotal}");
        Check(state.Pot == state.Players.Sum(p => p.TotalContributed), "pot doesn't match what players contributed");
        Check(state.Players.All(p => p.Stack >= 0 && p.CurrentBet >= 0 && p.TotalContributed >= 0), "negative chip amount");
        Check(state.DealerIndex >= 0 && state.DealerIndex < state.Players.Count, "dealer index out of range");
        Check(room.Players.Select(p => p.PlayerId)
                .SequenceEqual(state.PendingSeatOrder ?? state.Players.Select(p => p.PlayerId)),
            "seating doesn't match the room's order (applied or pending)");

        if (state.IsHandActive)
        {
            Check(state.Phase != GamePhase.Showdown, "hand marked active at Showdown");
            var actor = state.Players.FirstOrDefault(p => p.PlayerId == state.ActivePlayerTurnId);
            Check(actor != null, "active hand with nobody on turn");
            Check(!actor!.HasFolded && !actor.IsAllIn && !actor.IsEliminated, $"{actor.PlayerId} is on turn but can't act");
            var fold = GameEngine.ValidateAction(state, new ActionRequest { PlayerId = actor.PlayerId, Action = PokerAction.Fold });
            Check(fold.IsSuccess, $"player on turn can't fold: {fold.Error}");
            var passive = actor.CurrentBet == state.CurrentBet ? PokerAction.Check : PokerAction.Call;
            var passiveResult = GameEngine.ValidateAction(state, new ActionRequest { PlayerId = actor.PlayerId, Action = passive });
            Check(passiveResult.IsSuccess, $"player on turn can't {passive}: {passiveResult.Error}");
            return;
        }

        Check(state.ActivePlayerTurnId == null, "a player is on turn while no hand is active");
        if (state.Phase == GamePhase.Showdown)
        {
            Check(state.Pots.Count > 0, "showdown with no pots to award");
            Check(state.Pots.Sum(p => p.Amount) == state.Pot, "pots don't add up to the pot");
            Check(state.Pots.All(p => p.EligiblePlayerIds.Count > 0), "pot with nobody eligible");
            return;
        }

        var seated = state.Players.Where(p => !p.IsEliminated).ToList();
        Check(seated.Any(p => p.IsAwaitingRebuy) || seated.Count < 2,
            "idle table with two or more seated players and no pending rebuy decision");
        Check(state.PendingSeatOrder == null, "pending seat order while no hand is in progress");
    }
}
