using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Enums;

namespace ChipTracker.Domain.Engine;

/// <summary>
/// Core game logic engine for poker rules validation and state transitions.
/// All methods are pure and immutable - they return new state objects.
/// </summary>
public static class GameEngine
{
    /// <summary>
    /// Helper to emit an activity entry to the pending log.
    /// Auto-stamps Phase, PlayerName, and HandNumber if not already set.
    /// </summary>
    private static void Emit(GameState state, ActivityEntry entry)
    {
        // Auto-stamp fields if not already set
        entry.Phase ??= state.Phase;
        entry.HandNumber = state.HandNumber;
        
        if (entry.PlayerId != null && entry.PlayerName == null)
        {
            var player = state.Players.FirstOrDefault(p => p.PlayerId == entry.PlayerId);
            if (player != null)
            {
                entry.PlayerName = player.Name;
            }
        }
        
        state.PendingLog.Add(entry);
    }

    /// <summary>
    /// Validates an action request and returns either the new game state or an error message.
    /// </summary>
    public static Result<GameState> ValidateAction(GameState state, ActionRequest request)
    {
        // Find requesting player
        var requestingPlayer = state.Players.FirstOrDefault(p => p.PlayerId == request.PlayerId);
        if (requestingPlayer == null)
            return Result<GameState>.Failure("Player not found in game");

        // Hand-lifecycle guard: no actions once the hand has ended (all-in runout or showdown).
        if (!state.IsHandActive || state.Phase == GamePhase.Showdown)
            return Result<GameState>.Failure("Hand is not active");

        // Turn enforcement
        if (state.ActivePlayerTurnId != request.PlayerId)
            return Result<GameState>.Failure("Not your turn");

        // A folded or all-in player can never legitimately be on turn, but guard defensively.
        if (requestingPlayer.HasFolded)
            return Result<GameState>.Failure("You have folded");

        if (requestingPlayer.IsAllIn)
            return Result<GameState>.Failure("You are all-in");

        // Validate action based on type
        return request.Action switch
        {
            PokerAction.Fold => ValidateFold(state, requestingPlayer),
            PokerAction.Check => ValidateCheck(state, requestingPlayer),
            PokerAction.Call => ValidateCall(state, requestingPlayer),
            PokerAction.Bet => ValidateBet(state, requestingPlayer, request.Amount ?? 0),
            PokerAction.Raise => ValidateRaise(state, requestingPlayer, request.Amount ?? 0),
            PokerAction.AllIn => ValidateAllIn(state, requestingPlayer),
            _ => Result<GameState>.Failure("Invalid action")
        };
    }

    /// <summary>
    /// Validates a fold action. If only one player remains in the hand, instantly awards the
    /// pot to them and starts the next hand. Otherwise hands off to <see cref="CompleteAction"/>
    /// to advance the turn and detect round/hand completion.
    /// </summary>
    private static Result<GameState> ValidateFold(GameState state, Player requestingPlayer)
    {
        var newState = state.Clone();
        var player = newState.Players.First(p => p.PlayerId == requestingPlayer.PlayerId);
        player.HasFolded = true;

        Emit(newState, new ActivityEntry
        {
            EntryType = ActivityEntryType.PlayerAction,
            PlayerId = requestingPlayer.PlayerId,
            Action = PokerAction.Fold,
            Amount = 0
        });

        newState = AdvanceTurn(newState);
        newState = CompleteAction(newState);

        return Result<GameState>.Success(newState);
    }

    /// <summary>
    /// Validates a check action (valid only if no outstanding bet).
    /// </summary>
    private static Result<GameState> ValidateCheck(GameState state, Player requestingPlayer)
    {
        if (state.CurrentBet != requestingPlayer.CurrentBet)
            return Result<GameState>.Failure("Cannot check when there is an outstanding bet");

        var newState = state.Clone();
        var player = newState.Players.First(p => p.PlayerId == requestingPlayer.PlayerId);
        player.HasActedThisStreet = true;

        Emit(newState, new ActivityEntry
        {
            EntryType = ActivityEntryType.PlayerAction,
            PlayerId = requestingPlayer.PlayerId,
            Action = PokerAction.Check,
            Amount = 0
        });

        newState = AdvanceTurn(newState);
        newState = CompleteAction(newState);

        return Result<GameState>.Success(newState);
    }

    /// <summary>
    /// Validates a call action.
    /// </summary>
    private static Result<GameState> ValidateCall(GameState state, Player requestingPlayer)
    {
        if (state.CurrentBet == requestingPlayer.CurrentBet && state.CurrentBet == 0)
            return Result<GameState>.Failure("No bet to call");

        var amountToCall = state.CurrentBet - requestingPlayer.CurrentBet;
        if (amountToCall < 0)
            return Result<GameState>.Failure("Nothing to call - check instead");

        var newState = state.Clone();
        var player = newState.Players.First(p => p.PlayerId == requestingPlayer.PlayerId);

        if (player.Stack <= amountToCall)
        {
            // Short stack - calling pushes them all-in for whatever they have left.
            CommitChips(newState, player, player.Stack);
            player.IsAllIn = true;
        }
        else
        {
            CommitChips(newState, player, amountToCall);
        }

        player.HasActedThisStreet = true;

        Emit(newState, new ActivityEntry
        {
            EntryType = ActivityEntryType.PlayerAction,
            PlayerId = requestingPlayer.PlayerId,
            Action = PokerAction.Call,
            Amount = amountToCall
        });

        newState = AdvanceTurn(newState);
        newState = CompleteAction(newState);

        return Result<GameState>.Success(newState);
    }

    /// <summary>
    /// Validates a bet action (valid only when no bet exists this round).
    /// </summary>
    private static Result<GameState> ValidateBet(GameState state, Player requestingPlayer, int amount)
    {
        if (state.CurrentBet != 0)
            return Result<GameState>.Failure("Cannot bet when a bet exists");

        if (amount < state.BigBlind)
            return Result<GameState>.Failure($"Minimum bet is {state.BigBlind}");

        if (amount > requestingPlayer.Stack)
            return Result<GameState>.Failure("Insufficient stack to place bet");

        var newState = state.Clone();
        var player = newState.Players.First(p => p.PlayerId == requestingPlayer.PlayerId);

        CommitChips(newState, player, amount);
        newState.CurrentBet = amount;
        newState.MinRaise = amount;
        player.HasActedThisStreet = true;
        if (player.Stack == 0)
            player.IsAllIn = true;

        Emit(newState, new ActivityEntry
        {
            EntryType = ActivityEntryType.PlayerAction,
            PlayerId = requestingPlayer.PlayerId,
            Action = PokerAction.Bet,
            Amount = amount
        });

        ReopenAction(newState, player.PlayerId);
        newState = AdvanceTurn(newState);
        newState = CompleteAction(newState);
        return Result<GameState>.Success(newState);
    }

    /// <summary>
    /// Validates a raise action.
    /// </summary>
    private static Result<GameState> ValidateRaise(GameState state, Player requestingPlayer, int totalRaiseAmount)
    {
        if (state.CurrentBet == 0)
            return Result<GameState>.Failure("Cannot raise with no bet to raise");

        var minRaiseAmount = state.CurrentBet + state.MinRaise;
        if (totalRaiseAmount < minRaiseAmount)
            return Result<GameState>.Failure($"Minimum raise is {minRaiseAmount}");

        if (totalRaiseAmount > requestingPlayer.Stack + requestingPlayer.CurrentBet)
            return Result<GameState>.Failure("Insufficient stack for raise");

        var newState = state.Clone();
        var player = newState.Players.First(p => p.PlayerId == requestingPlayer.PlayerId);

        var amountToAdd = totalRaiseAmount - requestingPlayer.CurrentBet;
        CommitChips(newState, player, amountToAdd);
        newState.MinRaise = totalRaiseAmount - state.CurrentBet;
        newState.CurrentBet = totalRaiseAmount;
        player.HasActedThisStreet = true;
        if (player.Stack == 0)
            player.IsAllIn = true;

        Emit(newState, new ActivityEntry
        {
            EntryType = ActivityEntryType.PlayerAction,
            PlayerId = requestingPlayer.PlayerId,
            Action = PokerAction.Raise,
            Amount = totalRaiseAmount
        });

        ReopenAction(newState, player.PlayerId);
        newState = AdvanceTurn(newState);
        newState = CompleteAction(newState);
        return Result<GameState>.Success(newState);
    }

    /// <summary>
    /// Validates an all-in action.
    /// </summary>
    private static Result<GameState> ValidateAllIn(GameState state, Player requestingPlayer)
    {
        if (requestingPlayer.Stack <= 0)
            return Result<GameState>.Failure("No stack to push all-in");

        var newState = state.Clone();
        var player = newState.Players.First(p => p.PlayerId == requestingPlayer.PlayerId);

        var stackToCommit = player.Stack;
        var totalBetAmount = player.CurrentBet + stackToCommit;
        var isRaise = totalBetAmount > state.CurrentBet;

        CommitChips(newState, player, stackToCommit);
        player.IsAllIn = true;
        player.HasActedThisStreet = true;

        Emit(newState, new ActivityEntry
        {
            EntryType = ActivityEntryType.PlayerAction,
            PlayerId = requestingPlayer.PlayerId,
            Action = PokerAction.AllIn,
            Amount = stackToCommit
        });

        if (isRaise)
        {
            newState.MinRaise = totalBetAmount - state.CurrentBet;
            newState.CurrentBet = totalBetAmount;
            ReopenAction(newState, player.PlayerId);
        }

        newState = AdvanceTurn(newState);
        newState = CompleteAction(newState);
        return Result<GameState>.Success(newState);
    }

    /// <summary>
    /// Advances turn to the next player still able to act (not folded, not all-in).
    /// If no one remains able to act, clears the turn (the hand-completion decision is
    /// made by <see cref="CompleteAction"/>, not here).
    /// </summary>
    public static GameState AdvanceTurn(GameState state)
    {
        var ableToAct = PlayersAbleToAct(state);

        if (ableToAct.Count == 0)
        {
            state.ActivePlayerTurnId = null;
            return state;
        }

        var currentIndex = state.Players.FindIndex(p => p.PlayerId == state.ActivePlayerTurnId);
        var nextIndex = (currentIndex + 1) % state.Players.Count;

        while (!ableToAct.Any(p => p.PlayerId == state.Players[nextIndex].PlayerId))
        {
            nextIndex = (nextIndex + 1) % state.Players.Count;
        }

        state.ActivePlayerTurnId = state.Players[nextIndex].PlayerId;
        return state;
    }

    /// <summary>
    /// Advances to the next phase and resets bets. When the River closes, transitions straight
    /// to Showdown via <see cref="EndHandAtShowdown"/> (refunds any uncalled excess and clears
    /// the turn). Post-flop first-to-act: first player after the dealer who can still act
    /// (works identically for heads-up and multi-player).
    /// </summary>
    public static GameState AdvancePhase(GameState state)
    {
        var oldPhase = state.Phase;
        state.Phase = state.Phase switch
        {
            GamePhase.PreFlop => GamePhase.Flop,
            GamePhase.Flop => GamePhase.Turn,
            GamePhase.Turn => GamePhase.River,
            GamePhase.River => GamePhase.Showdown,
            _ => GamePhase.Showdown
        };

        Emit(state, new ActivityEntry
        {
            EntryType = ActivityEntryType.PhaseAdvanced,
            OldPhase = oldPhase,
            NewPhase = state.Phase
        });

        if (state.Phase == GamePhase.Showdown)
        {
            return EndHandAtShowdown(state);
        }

        // Reset bets and action flags for the new street.
        state.CurrentBet = 0;
        state.MinRaise = state.BigBlind;
        foreach (var player in state.Players)
        {
            if (!player.IsAllIn && !player.HasFolded)
            {
                player.CurrentBet = 0;
            }

            player.HasActedThisStreet = false;
        }

        var firstActIdx = (state.DealerIndex + 1) % state.Players.Count;
        while (state.Players[firstActIdx].HasFolded || state.Players[firstActIdx].IsAllIn)
        {
            firstActIdx = (firstActIdx + 1) % state.Players.Count;
        }

        state.ActivePlayerTurnId = state.Players[firstActIdx].PlayerId;
        state.StreetFirstActorId = state.ActivePlayerTurnId;
        return state;
    }

    /// <summary>
    /// Single funnel that every action-mutating validator calls (after advancing the turn) to
    /// decide what happens next: award the pot if only one player remains, jump straight to
    /// Showdown if no further betting is possible (all-in runout), advance to the next street
    /// once every player able to act has matched the bet and acted, or simply wait for the next
    /// player's action. Loops so that a street transition which immediately has no further
    /// betting possible (e.g. everyone left is all-in) also lands on Showdown, not a stuck street.
    /// </summary>
    private static GameState CompleteAction(GameState state)
    {
        while (true)
        {
            if (!state.IsHandActive)
                return state;

            var playersInHand = state.Players.Where(p => !p.HasFolded).ToList();
            if (playersInHand.Count == 1)
            {
                var winner = playersInHand[0];
                Emit(state, new ActivityEntry
                {
                    EntryType = ActivityEntryType.PotWon,
                    PlayerId = winner.PlayerId,
                    Amount = state.Pot,
                    PotIndex = 0
                });
                return ResolveShowdown(state, winner.PlayerId);
            }

            if (NoFurtherBettingPossible(state))
                return EndHandAtShowdown(state);

            var ableToAct = PlayersAbleToAct(state);
            var roundComplete = ableToAct.Count > 0 &&
                ableToAct.All(p => p.HasActedThisStreet && p.CurrentBet == state.CurrentBet);

            if (!roundComplete)
                return state;

            state = AdvancePhase(state);
        }
    }

    /// <summary>
    /// Players still in the hand (not folded) who still have chips and are not all-in - the
    /// only players who can take a further betting action this hand.
    /// </summary>
    private static List<Player> PlayersAbleToAct(GameState state) =>
        state.Players.Where(p => !p.HasFolded && !p.IsAllIn).ToList();

    /// <summary>
    /// True when no further betting can occur this hand: either nobody remains able to act
    /// (everyone left is all-in), or exactly one player can still act and they aren't facing
    /// a bet from anyone still in the hand (there's no one left who could respond to a further
    /// bet). The opposing bet is capped at <see cref="GameState.CurrentBet"/> because all-in
    /// players keep their earlier-street bet on display, and an all-in big blind shorter than
    /// the full blind leaves CurrentBet above anything actually wagered.
    /// </summary>
    private static bool NoFurtherBettingPossible(GameState state)
    {
        var ableToAct = PlayersAbleToAct(state);

        if (ableToAct.Count == 0)
            return true;

        if (ableToAct.Count == 1)
        {
            var actor = ableToAct[0];
            var highestOpposingBet = state.Players
                .Where(p => !p.HasFolded && p.PlayerId != actor.PlayerId)
                .Select(p => p.CurrentBet)
                .DefaultIfEmpty(0)
                .Max();
            return actor.CurrentBet >= Math.Min(state.CurrentBet, highestOpposingBet);
        }

        return false;
    }

    /// <summary>
    /// True while a hand is being played or has ended at Showdown and is awaiting its winner(s).
    /// No new hand may be dealt in either case.
    /// </summary>
    private static bool IsHandInProgress(GameState state) =>
        state.IsHandActive || state.Phase == GamePhase.Showdown;

    /// <summary>
    /// Ends the hand immediately without playing out remaining streets one action at a time
    /// (all-in runout): refunds any uncalled excess, builds the pot(s) that will need a winner
    /// selected, jumps to Showdown, marks the hand inactive, and clears the turn so no further
    /// actions are accepted.
    /// </summary>
    private static GameState EndHandAtShowdown(GameState state)
    {
        RefundUncalledBet(state);
        state.Phase = GamePhase.Showdown;
        state.IsHandActive = false;
        state.ActivePlayerTurnId = null;
        state.Pots = BuildPots(state);
        return state;
    }

    /// <summary>
    /// Splits the pot into layers ("main pot" plus zero or more side pots) based on each
    /// in-hand player's whole-hand contribution. Every distinct contribution level among
    /// players still in the hand becomes a layer boundary; a layer's amount is the sum, over
    /// every player (folded included, since dead money still counts), of how much of their
    /// contribution falls within that layer. A player is eligible for a layer only if they are
    /// still in the hand and contributed at least up to that layer's level. Layers with
    /// identical eligibility are merged into a single pot.
    /// </summary>
    public static List<PotShare> BuildPots(GameState state)
    {
        var inHand = state.Players.Where(p => !p.HasFolded).ToList();
        if (inHand.Count == 0)
            return [];

        var levels = inHand
            .Select(p => p.TotalContributed)
            .Where(c => c > 0)
            .Distinct()
            .OrderBy(c => c)
            .ToList();

        var pots = new List<PotShare>();
        var previousLevel = 0;

        foreach (var level in levels)
        {
            var layerAmount = state.Players.Sum(p => Math.Min(p.TotalContributed, level) - Math.Min(p.TotalContributed, previousLevel));
            if (layerAmount <= 0)
            {
                previousLevel = level;
                continue;
            }

            var eligible = inHand.Where(p => p.TotalContributed >= level).Select(p => p.PlayerId).ToList();

            if (pots.Count > 0 && pots[^1].EligiblePlayerIds.SequenceEqual(eligible))
            {
                pots[^1].Amount += layerAmount;
            }
            else
            {
                pots.Add(new PotShare { Amount = layerAmount, EligiblePlayerIds = eligible });
            }

            previousLevel = level;
        }

        return pots;
    }

    /// <summary>
    /// Awards each pot in <paramref name="state"/>.Pots to the winner(s) specified in
    /// <paramref name="awards"/> (one award per pot, matched by index), splitting a pot's
    /// amount evenly among its winners with any remainder going to the lowest seat index
    /// among them. Every award must reference an existing pot exactly once, and every winner
    /// must be eligible for the pot they're awarded. After all pots are distributed, rotates
    /// the dealer and starts the next hand exactly like <see cref="ResolveShowdown"/>.
    /// </summary>
    public static Result<GameState> AwardPots(GameState state, IReadOnlyList<PotAward> awards)
    {
        if (awards.Count != state.Pots.Count)
            return Result<GameState>.Failure("Every pot must have exactly one award");

        var awardsByIndex = awards.ToDictionary(a => a.PotIndex);
        for (var i = 0; i < state.Pots.Count; i++)
        {
            if (!awardsByIndex.TryGetValue(i, out var award) || award.WinnerPlayerIds.Count == 0)
                return Result<GameState>.Failure($"Pot {i} has no award");

            var pot = state.Pots[i];
            foreach (var winnerId in award.WinnerPlayerIds)
            {
                if (!pot.EligiblePlayerIds.Contains(winnerId))
                    return Result<GameState>.Failure($"Player {winnerId} is not eligible to win pot {i}");
            }
        }

        foreach (var i in Enumerable.Range(0, state.Pots.Count))
        {
            var pot = state.Pots[i];
            var award = awardsByIndex[i];
            var winners = award.WinnerPlayerIds
                .Select(id => state.Players.First(p => p.PlayerId == id))
                .OrderBy(p => state.Players.IndexOf(p))
                .ToList();

            var share = pot.Amount / winners.Count;
            var remainder = pot.Amount % winners.Count;

            foreach (var winner in winners)
            {
                winner.Stack += share;
                Emit(state, new ActivityEntry
                {
                    EntryType = ActivityEntryType.PotWon,
                    PlayerId = winner.PlayerId,
                    Amount = share,
                    PotIndex = i
                });
            }

            winners[0].Stack += remainder;
        }

        state.Pot = 0;
        state.Pots = [];
        EndHandBookkeeping(state);

        return Result<GameState>.Success(state);
    }

    /// <summary>
    /// Refunds the uncalled portion of a bet: if exactly one in-hand player has contributed
    /// more (across the whole hand) than every other in-hand player, the excess over the
    /// highest contribution by anyone else is returned to their stack and removed from the pot.
    /// Folded players count: their chips called the bet up to what they put in before folding.
    /// </summary>
    private static void RefundUncalledBet(GameState state)
    {
        var inHand = state.Players.Where(p => !p.HasFolded).ToList();
        if (inHand.Count < 2)
            return;

        var maxContribution = inHand.Max(p => p.TotalContributed);
        var topContributors = inHand.Where(p => p.TotalContributed == maxContribution).ToList();
        if (topContributors.Count != 1)
            return; // tie for the top contribution - nothing uncalled

        var bettor = topContributors[0];
        var highestMatched = state.Players
            .Where(p => p.PlayerId != bettor.PlayerId)
            .Select(p => p.TotalContributed)
            .DefaultIfEmpty(0)
            .Max();

        var excess = maxContribution - highestMatched;
        if (excess <= 0)
            return;

        bettor.Stack += excess;
        bettor.CurrentBet -= excess;
        bettor.TotalContributed -= excess;
        state.Pot -= excess;

        Emit(state, new ActivityEntry
        {
            EntryType = ActivityEntryType.Refund,
            PlayerId = bettor.PlayerId,
            Amount = excess
        });
    }

    /// <summary>
    /// Commits chips from a player into the pot, keeping stack, current-street bet, and
    /// whole-hand contribution in sync.
    /// </summary>
    private static void CommitChips(GameState state, Player player, int amount)
    {
        state.Pot += amount;
        player.Stack -= amount;
        player.CurrentBet += amount;
        player.TotalContributed += amount;
    }

    /// <summary>
    /// A bet or raise reopens the betting round: every other player still in the hand and able
    /// to act must be given another chance to respond, even if they had already acted this street.
    /// </summary>
    private static void ReopenAction(GameState state, string aggressorPlayerId)
    {
        foreach (var p in state.Players)
        {
            if (p.PlayerId == aggressorPlayerId || p.HasFolded || p.IsAllIn)
                continue;

            p.HasActedThisStreet = false;
        }
    }

    /// <summary>
    /// Resolves showdown: awards pot to winner, rotates dealer, resets for new hand.
    /// Heads-up rule: dealer = SB, other = BB. SB/dealer acts first pre-flop.
    /// </summary>
    public static GameState ResolveShowdown(GameState state, string winnerPlayerId)
    {
        var winner = state.Players.FirstOrDefault(p => p.PlayerId == winnerPlayerId);
        if (winner == null)
            return state;

        var potAmount = state.Pot;
        winner.Stack += state.Pot;
        state.Pot = 0;
        state.Pots = [];

        if (potAmount > 0)
        {
            Emit(state, new ActivityEntry
            {
                EntryType = ActivityEntryType.PotWon,
                PlayerId = winnerPlayerId,
                Amount = potAmount,
                PotIndex = 0
            });
        }

        EndHandBookkeeping(state);

        return state;
    }

    /// <summary>
    /// Resolves showdown with a split pot: splits evenly, remainder chip goes to first player by seat.
    /// Rotates dealer and resets for new hand.
    /// </summary>
    public static GameState ResolveSplitPot(GameState state)
    {
        var activePlayers = state.Players.Where(p => !p.HasFolded).ToList();
        if (activePlayers.Count == 0)
            return state;

        var share = state.Pot / activePlayers.Count;
        var remainder = state.Pot % activePlayers.Count;

        foreach (var p in activePlayers)
        {
            p.Stack += share;
            Emit(state, new ActivityEntry
            {
                EntryType = ActivityEntryType.PotWon,
                PlayerId = p.PlayerId,
                Amount = share,
                PotIndex = 0
            });
        }

        // Remainder to lowest seat-index winner
        activePlayers[0].Stack += remainder;

        state.Pot = 0;
        state.Pots = [];
        EndHandBookkeeping(state);

        return state;
    }

    /// <summary>
    /// Players who occupy a seat at the table (not eliminated). Awaiting-rebuy players are
    /// still seated - they occupy a seat and count toward dealer rotation - but the hand
    /// cannot start while any of them has yet to decide.
    /// </summary>
    private static List<Player> SeatedPlayers(GameState state) =>
        state.Players.Where(p => !p.IsEliminated).ToList();

    /// <summary>
    /// A hand can be dealt once at least two seats are occupied and nobody seated still has a
    /// rebuy decision to make.
    /// </summary>
    private static bool CanDealHand(GameState state)
    {
        var seated = SeatedPlayers(state);
        return seated.Count >= 2 && !seated.Any(p => p.IsAwaitingRebuy);
    }

    /// <summary>
    /// Common "end of hand" bookkeeping shared by <see cref="ResolveShowdown"/>,
    /// <see cref="ResolveSplitPot"/>, and <see cref="AwardPots"/>: applies any pending seating
    /// change, rotates the dealer, resets every player's per-hand state (marking anyone who
    /// busted to zero as awaiting a rebuy decision, and permanently folding eliminated players
    /// out of the deal), then attempts to start the next hand.
    /// </summary>
    private static void EndHandBookkeeping(GameState state)
    {
        // Seat first so the button moves to the left of the previous dealer in the new order.
        ApplyPendingSeatOrder(state);
        state.DealerIndex = AdvanceToNextSeated(state, state.DealerIndex);

        state.CurrentBet = 0;
        state.MinRaise = state.BigBlind;
        state.Phase = GamePhase.PreFlop;
        state.IsHandActive = false;
        state.ActivePlayerTurnId = null;

        ResetPlayersForNewHand(state);
        TryStartHand(state);
    }

    /// <summary>
    /// Clears every player's per-hand state ahead of a new deal. Eliminated players stay folded
    /// out; anyone left with no chips is marked as awaiting a rebuy decision.
    /// </summary>
    private static void ResetPlayersForNewHand(GameState state)
    {
        foreach (var player in state.Players)
        {
            if (player.IsEliminated)
            {
                player.HasFolded = true;
                player.IsAllIn = false;
                player.CurrentBet = 0;
                player.TotalContributed = 0;
                player.HasActedThisStreet = false;
                player.IsDealer = false;
                continue;
            }

            if (player.Stack == 0 && !player.IsAwaitingRebuy)
                player.IsAwaitingRebuy = true;

            player.HasFolded = false;
            player.IsAllIn = false;
            player.CurrentBet = 0;
            player.TotalContributed = 0;
            player.HasActedThisStreet = false;
            player.IsDealer = player.PlayerId == state.Players[state.DealerIndex].PlayerId;
        }
    }

    /// <summary>
    /// Starts the next hand (posts blinds) only if no hand is already in progress, every seated
    /// player has resolved any pending rebuy decision, and at least two seats are occupied.
    /// Otherwise leaves the table waiting for the pending decision(s) or more players.
    /// </summary>
    private static void TryStartHand(GameState state)
    {
        // Never deal over a hand that is still being played or awaiting its showdown result.
        if (IsHandInProgress(state))
            return;

        if (!CanDealHand(state))
        {
            state.IsHandActive = false;
            state.ActivePlayerTurnId = null;
            return;
        }

        if (state.Players[state.DealerIndex].IsEliminated)
        {
            state.DealerIndex = AdvanceToNextSeated(state, state.DealerIndex);
            foreach (var player in state.Players)
                player.IsDealer = player.PlayerId == state.Players[state.DealerIndex].PlayerId;
        }

        state.IsHandActive = true;
        state.HandNumber++;

        Emit(state, new ActivityEntry
        {
            EntryType = ActivityEntryType.HandStarted
        });

        PostBlinds(state);
        CompleteAction(state);
    }

    /// <summary>
    /// Finds the next seated (non-eliminated) player index after <paramref name="fromIndex"/>,
    /// always advancing at least once.
    /// </summary>
    private static int AdvanceToNextSeated(GameState state, int fromIndex)
    {
        var idx = fromIndex;
        do
        {
            idx = (idx + 1) % state.Players.Count;
        } while (state.Players[idx].IsEliminated);

        return idx;
    }

    /// <summary>
    /// Applies a rebuy: restores the requesting player's stack to <paramref name="amount"/> and
    /// clears both the awaiting-rebuy and eliminated flags (so an eliminated player can buy back
    /// in at any time, not just one who just busted). An eliminated player buying back in while
    /// a hand is in progress sits that hand out and is dealt into the next one. Starts the next
    /// hand if this was the last pending decision.
    /// </summary>
    public static Result<GameState> ApplyRebuy(GameState state, string playerId, int amount)
    {
        var player = state.Players.FirstOrDefault(p => p.PlayerId == playerId);
        if (player == null)
            return Result<GameState>.Failure("Player not found in game");

        if (!player.IsAwaitingRebuy && !player.IsEliminated)
            return Result<GameState>.Failure("Player is not eligible for a rebuy");

        var newState = state.Clone();
        var target = newState.Players.First(p => p.PlayerId == playerId);
        target.Stack = amount;
        target.IsAwaitingRebuy = false;
        target.IsEliminated = false;
        target.HasFolded = IsHandInProgress(newState);

        Emit(newState, new ActivityEntry
        {
            EntryType = ActivityEntryType.Rebuy,
            PlayerId = playerId,
            Amount = amount
        });

        TryStartHand(newState);

        return Result<GameState>.Success(newState);
    }

    /// <summary>
    /// Applies a cash-out: a player awaiting a rebuy decision may instead leave the table,
    /// marking them eliminated (excluded from blinds, dealer rotation, and turn order) until
    /// they choose to buy back in via <see cref="ApplyRebuy"/>. Starts the next hand if enough
    /// seated players remain and no one else is still deciding.
    /// </summary>
    public static Result<GameState> ApplyCashOut(GameState state, string playerId)
    {
        var player = state.Players.FirstOrDefault(p => p.PlayerId == playerId);
        if (player == null)
            return Result<GameState>.Failure("Player not found in game");

        if (!player.IsAwaitingRebuy)
            return Result<GameState>.Failure("Player is not awaiting a rebuy decision");

        var newState = state.Clone();
        var target = newState.Players.First(p => p.PlayerId == playerId);
        target.IsEliminated = true;
        target.IsAwaitingRebuy = false;
        target.HasFolded = true;
        target.CurrentBet = 0;
        target.IsAllIn = false;
        target.IsDealer = false;

        Emit(newState, new ActivityEntry
        {
            EntryType = ActivityEntryType.CashOut,
            PlayerId = playerId
        });

        TryStartHand(newState);

        return Result<GameState>.Success(newState);
    }

    /// <summary>
    /// True when <paramref name="orderedPlayerIds"/> lists every one of <paramref name="players"/>
    /// exactly once.
    /// </summary>
    public static bool IsValidSeatOrder(IReadOnlyCollection<Player> players, IReadOnlyList<string> orderedPlayerIds) =>
        orderedPlayerIds.Count == players.Count
        && orderedPlayerIds.Distinct().Count() == players.Count
        && players.All(p => orderedPlayerIds.Contains(p.PlayerId));

    /// <summary>
    /// Changes the seating order (clockwise: the dealer button and the action move to the next
    /// seat in this order). While a hand is in progress the change is held in
    /// <see cref="GameState.PendingSeatOrder"/> and applied when the next hand is dealt;
    /// otherwise it applies immediately. Either way the dealer button stays with the same
    /// player. Mutates <paramref name="state"/> in place, and emits a
    /// <see cref="ActivityEntryType.SeatsReordered"/> entry when
    /// <paramref name="requestedByPlayerId"/> is given. Returns false (and changes nothing) if
    /// the order isn't a permutation of the players.
    /// </summary>
    public static bool ApplySeatOrder(GameState state, IReadOnlyList<string> orderedPlayerIds, string? requestedByPlayerId = null)
    {
        if (!IsValidSeatOrder(state.Players, orderedPlayerIds))
            return false;

        if (IsHandInProgress(state))
        {
            var unchanged = state.Players.Select(p => p.PlayerId).SequenceEqual(orderedPlayerIds);
            state.PendingSeatOrder = unchanged ? null : orderedPlayerIds.ToList();
        }
        else
        {
            ReorderPlayers(state, orderedPlayerIds);
            state.PendingSeatOrder = null;
        }

        if (requestedByPlayerId != null)
        {
            Emit(state, new ActivityEntry
            {
                EntryType = ActivityEntryType.SeatsReordered,
                PlayerId = requestedByPlayerId
            });
        }

        return true;
    }

    private static void ApplyPendingSeatOrder(GameState state)
    {
        if (state.PendingSeatOrder != null && IsValidSeatOrder(state.Players, state.PendingSeatOrder))
            ReorderPlayers(state, state.PendingSeatOrder);

        state.PendingSeatOrder = null;
    }

    /// <summary>Reorders the players, keeping <see cref="GameState.DealerIndex"/> on the same player.</summary>
    private static void ReorderPlayers(GameState state, IReadOnlyList<string> orderedPlayerIds)
    {
        var dealerId = state.Players[state.DealerIndex].PlayerId;
        state.Players = orderedPlayerIds.Select(id => state.Players.First(p => p.PlayerId == id)).ToList();
        state.DealerIndex = state.Players.FindIndex(p => p.PlayerId == dealerId);
    }

    /// <summary>
    /// Administrative override that abandons the current hand: every chip committed this hand
    /// goes back to the player who put it in, any pending seating change is applied, and the
    /// hand is re-dealt with the same dealer (blinds re-posted). Fails when no hand is in
    /// progress and none can be dealt (the table is waiting on a rebuy decision or players),
    /// since there is nothing to restart.
    /// </summary>
    public static Result<GameState> RestartHand(GameState state, string requestedByPlayerId)
    {
        if (!IsHandInProgress(state) && !CanDealHand(state))
            return Result<GameState>.Failure("No hand in progress to restart");

        var newState = state.Clone();

        Emit(newState, new ActivityEntry
        {
            EntryType = ActivityEntryType.HandRestarted,
            PlayerId = requestedByPlayerId
        });

        foreach (var player in newState.Players)
            player.Stack += player.TotalContributed;

        newState.Pot = 0;
        newState.Pots = [];
        newState.CurrentBet = 0;
        newState.MinRaise = newState.BigBlind;
        newState.Phase = GamePhase.PreFlop;
        newState.IsHandActive = false;
        newState.ActivePlayerTurnId = null;
        newState.StreetFirstActorId = null;

        ApplyPendingSeatOrder(newState);
        ResetPlayersForNewHand(newState);
        TryStartHand(newState);

        return Result<GameState>.Success(newState);
    }

    /// <summary>
    /// Posts blinds and sets first-to-act among seated (non-eliminated) players.
    /// Heads-up (2 seated): dealer = SB, acts first pre-flop.
    /// Multi-player: standard left-of-dealer SB/BB; first-to-act = after BB.
    /// A blind that exceeds a player's stack is clamped to what they have, pushing them all-in.
    /// </summary>
    private static void PostBlinds(GameState state)
    {
        var seated = SeatedPlayers(state);
        var dealerPlayer = state.Players[state.DealerIndex];

        Player sbPlayer, bbPlayer, firstToActPlayer;

        if (seated.Count == 2)
        {
            // Heads-up: dealer posts SB and acts first pre-flop.
            sbPlayer = dealerPlayer;
            bbPlayer = seated.First(p => p.PlayerId != dealerPlayer.PlayerId);
            firstToActPlayer = dealerPlayer;
        }
        else
        {
            var dealerSeatIdx = seated.FindIndex(p => p.PlayerId == dealerPlayer.PlayerId);
            sbPlayer = seated[(dealerSeatIdx + 1) % seated.Count];
            bbPlayer = seated[(dealerSeatIdx + 2) % seated.Count];
            firstToActPlayer = seated[(dealerSeatIdx + 3) % seated.Count];
        }

        var sbAmount = Math.Min(state.SmallBlind, sbPlayer.Stack);
        CommitChips(state, sbPlayer, sbAmount);
        if (sbPlayer.Stack == 0)
            sbPlayer.IsAllIn = true;

        Emit(state, new ActivityEntry
        {
            EntryType = ActivityEntryType.BlindPosted,
            PlayerId = sbPlayer.PlayerId,
            Amount = sbAmount,
            BlindType = BlindType.SmallBlind
        });

        var bbAmount = Math.Min(state.BigBlind, bbPlayer.Stack);
        CommitChips(state, bbPlayer, bbAmount);
        if (bbPlayer.Stack == 0)
            bbPlayer.IsAllIn = true;

        Emit(state, new ActivityEntry
        {
            EntryType = ActivityEntryType.BlindPosted,
            PlayerId = bbPlayer.PlayerId,
            Amount = bbAmount,
            BlindType = BlindType.BigBlind
        });

        // Everyone must call the full big blind even if the big blind is all-in for less.
        state.CurrentBet = state.BigBlind;

        foreach (var player in state.Players)
            player.HasActedThisStreet = false;

        state.ActivePlayerTurnId = firstToActPlayer.PlayerId;
        // A blind can put the first actor all-in (e.g. a short-stacked heads-up dealer).
        if (firstToActPlayer.IsAllIn)
            AdvanceTurn(state);
        state.StreetFirstActorId = state.ActivePlayerTurnId;
    }

    /// <summary>
    /// Creates initial game state for a new hand.
    /// Heads-up (2 players): dealer = SB, acts first pre-flop.
    /// </summary>
    public static GameState CreateInitialState(List<Player> players, int smallBlind, int bigBlind, int dealerIndex)
    {
        var state = new GameState
        {
            Players = players.Select(p => p.Clone()).ToList(),
            Pot = 0,
            CurrentBet = 0,
            Phase = GamePhase.PreFlop,
            DealerIndex = dealerIndex,
            SmallBlind = smallBlind,
            BigBlind = bigBlind,
            MinRaise = bigBlind,
            IsHandActive = true,
            HandNumber = 1
        };

        // Set dealer chip
        state.Players[dealerIndex].IsDealer = true;

        Emit(state, new ActivityEntry
        {
            EntryType = ActivityEntryType.HandStarted
        });

        PostBlinds(state);
        CompleteAction(state);

        return state;
    }
}

/// <summary>
/// Result pattern for validation errors.
/// </summary>
public class Result<T>
{
    public bool IsSuccess { get; }
    public T? Value { get; }
    public string? Error { get; }

    private Result(bool isSuccess, T? value, string? error)
    {
        IsSuccess = isSuccess;
        Value = value;
        Error = error;
    }

    public static Result<T> Success(T value) => new(true, value, null);
    public static Result<T> Failure(string error) => new(false, default, error);
}
