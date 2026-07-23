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
    /// Validates an action request and returns either the new game state or an error message.
    /// </summary>
    public static Result<GameState> ValidateAction(GameState state, ActionRequest request)
    {
        // Find requesting player
        var requestingPlayer = state.Players.FirstOrDefault(p => p.PlayerId == request.PlayerId);
        if (requestingPlayer == null)
            return Result<GameState>.Failure("Player not found in game");

        // Turn enforcement
        if (state.ActivePlayerTurnId != request.PlayerId)
            return Result<GameState>.Failure("Not your turn");

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
    /// Validates a fold action.
    /// </summary>
    private static Result<GameState> ValidateFold(GameState state, Player requestingPlayer)
    {
        var newState = state.Clone();
        var player = newState.Players.First(p => p.PlayerId == requestingPlayer.PlayerId);
        player.HasFolded = true;

        newState = AdvanceTurn(newState);
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
        newState = AdvanceTurn(newState);

        // Check if all remaining players have checked/called
        var activePlayers = newState.Players.Where(p => !p.HasFolded && !p.IsAllIn).ToList();
        if (activePlayers.All(p => p.CurrentBet == newState.CurrentBet))
        {
            newState = AdvancePhase(newState);
        }

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
        var newState = state.Clone();
        var player = newState.Players.First(p => p.PlayerId == requestingPlayer.PlayerId);

        if (player.Stack <= amountToCall)
        {
            // All-in
            newState.Pot += player.Stack;
            player.CurrentBet += player.Stack;
            player.Stack = 0;
            player.IsAllIn = true;
        }
        else
        {
            // Normal call
            newState.Pot += amountToCall;
            player.CurrentBet += amountToCall;
            player.Stack -= amountToCall;
        }

        newState = AdvanceTurn(newState);

        // Check if all remaining players have called
        var activePlayers = newState.Players.Where(p => !p.HasFolded && !p.IsAllIn).ToList();
        if (activePlayers.All(p => p.CurrentBet == newState.CurrentBet))
        {
            newState = AdvancePhase(newState);
        }

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

        newState.Pot += amount;
        newState.CurrentBet = amount;
        newState.MinRaise = amount;
        player.CurrentBet = amount;
        player.Stack -= amount;

        newState = AdvanceTurn(newState);
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
        newState.Pot += amountToAdd;
        newState.MinRaise = totalRaiseAmount - state.CurrentBet;
        newState.CurrentBet = totalRaiseAmount;
        player.CurrentBet = totalRaiseAmount;
        player.Stack -= amountToAdd;

        newState = AdvanceTurn(newState);
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

        var totalBetAmount = requestingPlayer.CurrentBet + requestingPlayer.Stack;
        newState.Pot += requestingPlayer.Stack;

        if (totalBetAmount > state.CurrentBet)
        {
            newState.CurrentBet = totalBetAmount;
            newState.MinRaise = totalBetAmount - state.CurrentBet;
        }

        player.CurrentBet = totalBetAmount;
        player.Stack = 0;
        player.IsAllIn = true;

        newState = AdvanceTurn(newState);
        return Result<GameState>.Success(newState);
    }

    /// <summary>
    /// Advances turn to the next active player.
    /// </summary>
    public static GameState AdvanceTurn(GameState state)
    {
        var activePlayers = state.Players
            .Where(p => !p.HasFolded && !p.IsAllIn)
            .ToList();

        if (activePlayers.Count <= 1)
        {
            // Hand over, move to showdown
            state.IsHandActive = false;
            return state;
        }

        var currentIndex = state.Players.FindIndex(p => p.PlayerId == state.ActivePlayerTurnId);
        var nextIndex = (currentIndex + 1) % state.Players.Count;

        // Find next active player
        while (!activePlayers.Any(p => p.PlayerId == state.Players[nextIndex].PlayerId))
        {
            nextIndex = (nextIndex + 1) % state.Players.Count;
        }

        state.ActivePlayerTurnId = state.Players[nextIndex].PlayerId;
        return state;
    }

    /// <summary>
    /// Advances to the next phase and resets bets.
    /// </summary>
    public static GameState AdvancePhase(GameState state)
    {
        state.Phase = state.Phase switch
        {
            GamePhase.PreFlop => GamePhase.Flop,
            GamePhase.Flop => GamePhase.Turn,
            GamePhase.Turn => GamePhase.River,
            GamePhase.River => GamePhase.Showdown,
            _ => GamePhase.Showdown
        };

        // Reset bets for new phase
        state.CurrentBet = 0;
        state.MinRaise = state.BigBlind;
        foreach (var player in state.Players)
        {
            if (!player.IsAllIn && !player.HasFolded)
            {
                player.CurrentBet = 0;
            }
        }

        // Set turn to first active player after dealer
        var dealerIdx = state.DealerIndex;
        var nextIdx = (dealerIdx + 1) % state.Players.Count;

        while (state.Players[nextIdx].HasFolded || state.Players[nextIdx].IsAllIn)
        {
            nextIdx = (nextIdx + 1) % state.Players.Count;
        }

        state.ActivePlayerTurnId = state.Players[nextIdx].PlayerId;
        return state;
    }

    /// <summary>
    /// Resolves showdown: awards pot to winner, rotates dealer, resets for new hand.
    /// </summary>
    public static GameState ResolveShowdown(GameState state, string winnerPlayerId)
    {
        var winner = state.Players.FirstOrDefault(p => p.PlayerId == winnerPlayerId);
        if (winner == null)
            return state;

        winner.Stack += state.Pot;

        // Rotate dealer
        state.DealerIndex = (state.DealerIndex + 1) % state.Players.Count;

        // Reset for new hand
        state.Pot = 0;
        state.CurrentBet = 0;
        state.MinRaise = state.BigBlind;
        state.Phase = GamePhase.PreFlop;
        state.IsHandActive = true;

        foreach (var player in state.Players)
        {
            player.HasFolded = false;
            player.IsAllIn = false;
            player.CurrentBet = 0;
            player.IsDealer = player.PlayerId == state.Players[state.DealerIndex].PlayerId;
        }

        // Post blinds
        var smallBlindIdx = (state.DealerIndex + 1) % state.Players.Count;
        var bigBlindIdx = (smallBlindIdx + 1) % state.Players.Count;

        var sbPlayer = state.Players[smallBlindIdx];
        var bbPlayer = state.Players[bigBlindIdx];

        sbPlayer.CurrentBet = state.SmallBlind;
        sbPlayer.Stack -= state.SmallBlind;
        state.Pot += state.SmallBlind;

        bbPlayer.CurrentBet = state.BigBlind;
        bbPlayer.Stack -= state.BigBlind;
        state.Pot += state.BigBlind;

        state.CurrentBet = state.BigBlind;
        state.ActivePlayerTurnId = state.Players[(bigBlindIdx + 1) % state.Players.Count].PlayerId;

        return state;
    }

    /// <summary>
    /// Creates initial game state for a new hand.
    /// </summary>
    public static GameState CreateInitialState(List<Player> players, int smallBlind, int bigBlind, int dealerIndex)
    {
        var state = new GameState
        {
            Players = players.Select(p => p.Clone()).ToList(),
            Pot = 0,
            CurrentBet = bigBlind,
            Phase = GamePhase.PreFlop,
            DealerIndex = dealerIndex,
            SmallBlind = smallBlind,
            BigBlind = bigBlind,
            MinRaise = bigBlind,
            IsHandActive = true
        };

        // Post blinds
        var smallBlindIdx = (dealerIndex + 1) % state.Players.Count;
        var bigBlindIdx = (smallBlindIdx + 1) % state.Players.Count;

        var sbPlayer = state.Players[smallBlindIdx];
        var bbPlayer = state.Players[bigBlindIdx];

        sbPlayer.CurrentBet = smallBlind;
        sbPlayer.Stack -= smallBlind;
        state.Pot += smallBlind;

        bbPlayer.CurrentBet = bigBlind;
        bbPlayer.Stack -= bigBlind;
        state.Pot += bigBlind;

        // Set dealer chip
        state.Players[dealerIndex].IsDealer = true;

        // First to act is after big blind
        state.ActivePlayerTurnId = state.Players[(bigBlindIdx + 1) % state.Players.Count].PlayerId;

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
