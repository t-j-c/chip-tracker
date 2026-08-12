using ChipTracker.Domain.Enums;

namespace ChipTracker.Domain.Entities;

/// <summary>
/// Represents a single activity log entry in a game (action, phase advance, etc.).
/// Emitted during game engine operations into GameState.PendingLog, then drained
/// by GameRoom.PushState into GameRoom.ActivityLog with sequence + state-version stamps.
/// </summary>
public class ActivityEntry
{
    /// <summary>
    /// Unique sequence number within this game room. Assigned when drained into GameRoom.ActivityLog.
    /// </summary>
    public int Sequence { get; set; }

    /// <summary>
    /// The type of activity: action, phase advance, pot won, rebuy, etc.
    /// </summary>
    public ActivityEntryType EntryType { get; set; }

    /// <summary>
    /// The player who performed the action or was affected (winner, blind poster, reboyer, etc.).
    /// Null for phase-advance entries.
    /// </summary>
    public string? PlayerId { get; set; }

    /// <summary>
    /// The poker action taken (Fold, Check, Call, Bet, Raise, AllIn). Only populated for PlayerAction entries.
    /// </summary>
    public PokerAction? Action { get; set; }

    /// <summary>
    /// The amount of chips involved: bet/raise amount, blind amount, pot won, rebuy amount, etc.
    /// Zero for check/fold (no chips committed by the actor in that action).
    /// </summary>
    public int Amount { get; set; }

    /// <summary>
    /// The old phase before advancement. Only populated for PhaseAdvanced entries.
    /// </summary>
    public GamePhase? OldPhase { get; set; }

    /// <summary>
    /// The new phase after advancement. Only populated for PhaseAdvanced entries.
    /// </summary>
    public GamePhase? NewPhase { get; set; }

    /// <summary>
    /// The state version (StateHistory.Count) when this entry was drained and stamped.
    /// Used to support undo: entries with StateVersion > current StateHistory.Count are marked IsUndone.
    /// </summary>
    public int StateVersion { get; set; }

    /// <summary>
    /// True if this entry's corresponding state has been undone (reverted). Entries are not deleted,
    /// only marked with this flag for display (strike-through effect).
    /// </summary>
    public bool IsUndone { get; set; }

    /// <summary>
    /// The name of the player who performed or was affected by this action.
    /// Auto-stamped from the game state if not explicitly set.
    /// </summary>
    public string? PlayerName { get; set; }

    /// <summary>
    /// The current game phase when this entry was created.
    /// Auto-stamped from the game state if not explicitly set.
    /// </summary>
    public GamePhase? Phase { get; set; }

    /// <summary>
    /// The pot index for PotWon entries. Identifies which pot was won.
    /// </summary>
    public int? PotIndex { get; set; }

    /// <summary>
    /// The blind type (SmallBlind or BigBlind) for BlindPosted entries.
    /// </summary>
    public BlindType? BlindType { get; set; }

    /// <summary>
    /// The hand number when this entry was created.
    /// Auto-stamped from the game state if not explicitly set.
    /// </summary>
    public int HandNumber { get; set; }

    /// <summary>
    /// Creates a deep copy of this activity entry.
    /// </summary>
    public ActivityEntry Clone()
    {
        return new ActivityEntry
        {
            Sequence = Sequence,
            EntryType = EntryType,
            PlayerId = PlayerId,
            Action = Action,
            Amount = Amount,
            OldPhase = OldPhase,
            NewPhase = NewPhase,
            StateVersion = StateVersion,
            IsUndone = IsUndone,
            PlayerName = PlayerName,
            Phase = Phase,
            PotIndex = PotIndex,
            BlindType = BlindType,
            HandNumber = HandNumber
        };
    }
}
