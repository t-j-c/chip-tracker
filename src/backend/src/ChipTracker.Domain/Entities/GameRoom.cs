using System.Text.Json.Serialization;
using ChipTracker.Domain.Engine;
using ChipTracker.Domain.Enums;

namespace ChipTracker.Domain.Entities;

public class GameRoom
{
    public string RoomCode { get; set; } = string.Empty;

    /// <summary>Monotonic persistence revision for optimistic concurrency; 0 for legacy items.</summary>
    public long Revision { get; set; }
    public List<Player> Players { get; set; } = [];
    public GameState? CurrentState { get; set; }
    /// <summary>
    /// Alias for CurrentState (used in tests and for consistency).
    /// </summary>
    [JsonIgnore]
    public GameState? GameState
    {
        get => CurrentState;
        set => CurrentState = value;
    }
    public List<GameState> StateHistory { get; set; } = [];

    /// <summary>Maximum number of undo states kept; keeps the persisted item well under DynamoDB's 400 KB cap.</summary>
    public const int MaxUndoHistory = 20;

    /// <summary>Highest GameState.StateVersion ever assigned in this room. Never decreases.</summary>
    public int LatestStateVersion { get; set; }
    public string? PendingUndoRequestBy { get; set; }
    public DateTime? UndoRequestedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime LastUpdatedAt { get; set; }

    // Game settings stored at room creation
    public int StartingStack { get; set; }
    public int SmallBlind { get; set; }
    public int BigBlind { get; set; }
    public int MaxPlayers { get; set; } = 9;

    // First player to join becomes the creator and can start the game
    public string? CreatorPlayerId { get; set; }

    // Activity log: durable record of all game events (max 500 entries)
    public List<ActivityEntry> ActivityLog { get; set; } = [];
    private int _nextActivitySequence = 1;
    public int NextActivitySequence
    {
        get => _nextActivitySequence;
        set => _nextActivitySequence = value;
    }

    [JsonIgnore]
    public bool IsGameStarted => CurrentState != null;

    /// <summary>
    /// Backfills state versions on rooms persisted before StateVersion existed
    /// (those stamped entries with StateHistory.Count + 1).
    /// </summary>
    public void EnsureStateVersions()
    {
        if (CurrentState == null || CurrentState.StateVersion != 0)
            return;

        for (var i = 0; i < StateHistory.Count; i++)
            StateHistory[i].StateVersion = i + 1;
        CurrentState.StateVersion = StateHistory.Count + 1;
        LatestStateVersion = Math.Max(
            Math.Max(LatestStateVersion, CurrentState.StateVersion),
            ActivityLog.Count == 0 ? 0 : ActivityLog.Max(e => e.StateVersion));
    }

    /// <summary>Drops the oldest undo states so at most <paramref name="keep"/> remain.</summary>
    public void TrimHistory(int keep)
    {
        if (StateHistory.Count > keep)
            StateHistory.RemoveRange(0, StateHistory.Count - keep);
    }

    /// <summary>
    /// Pushes the current state to history and replaces with new state.
    /// </summary>
    public void PushState(GameState newState)
    {
        EnsureStateVersions();
        if (CurrentState != null)
            StateHistory.Add(CurrentState.Clone());
        TrimHistory(MaxUndoHistory);
        newState.StateVersion = ++LatestStateVersion;
        CurrentState = newState;
        DrainActivityLog();
        ClearPendingUndo();
        LastUpdatedAt = DateTime.UtcNow;
    }

    /// <summary>
    /// Drains PendingLog from current state to ActivityLog with sequence numbering and state versioning.
    /// Called automatically by PushState(GameState).
    /// </summary>
    public void PushState()
    {
        if (CurrentState == null)
            return;
        
        EnsureStateVersions();
        DrainActivityLog();
        LastUpdatedAt = DateTime.UtcNow;
    }

    /// <summary>
    /// Transfers entries from GameState.PendingLog to ActivityLog with sequential numbering.
    /// Trims ActivityLog to max 500 entries (removes oldest).
    /// </summary>
    private void DrainActivityLog()
    {
        if (CurrentState?.PendingLog == null || CurrentState.PendingLog.Count == 0)
            return;

        if (CurrentState.StateVersion == 0)
            CurrentState.StateVersion = ++LatestStateVersion;
        var stateVersion = CurrentState.StateVersion;

        foreach (var entry in CurrentState.PendingLog)
        {
            entry.Sequence = _nextActivitySequence++;
            entry.StateVersion = stateVersion;
            
            ActivityLog.Add(entry);
        }

        // Trim to max 500 entries
        if (ActivityLog.Count > 500)
        {
            var toRemove = ActivityLog.Count - 500;
            ActivityLog.RemoveRange(0, toRemove);
        }

        // Clear PendingLog
        CurrentState.PendingLog.Clear();
    }

    /// <summary>
    /// Pops the last state from history and restores it as current. Seating isn't undoable, so
    /// the room's current seating order is re-applied to the restored state.
    /// </summary>
    public bool UndoLastAction()
    {
        EnsureStateVersions();
        if (StateHistory.Count == 0)
            return false;

        CurrentState = StateHistory[^1];
        StateHistory.RemoveAt(StateHistory.Count - 1);
        GameEngine.ApplySeatOrder(CurrentState, Players.Select(p => p.PlayerId).ToList());
        
        // Mark activity entries created after the restored state as undone
        foreach (var entry in ActivityLog)
        {
            if (entry.StateVersion > CurrentState.StateVersion && entry.EntryType != ActivityEntryType.SeatsReordered)
            {
                entry.IsUndone = true;
            }
        }
        
        ClearPendingUndo();
        LastUpdatedAt = DateTime.UtcNow;
        return true;
    }

    /// <summary>
    /// Changes the seating order (see <see cref="GameEngine.ApplySeatOrder"/>). Seating is
    /// room-level and deliberately not undoable: it is applied to the current state in place
    /// without pushing undo history. Returns false if the order isn't a permutation of the
    /// room's players.
    /// </summary>
    public bool SetSeatOrder(IReadOnlyList<string> orderedPlayerIds, string requestedByPlayerId)
    {
        if (!GameEngine.IsValidSeatOrder(Players, orderedPlayerIds))
            return false;

        Players = orderedPlayerIds.Select(id => Players.First(p => p.PlayerId == id)).ToList();

        if (CurrentState != null)
        {
            EnsureStateVersions();
            GameEngine.ApplySeatOrder(CurrentState, orderedPlayerIds, requestedByPlayerId);
            DrainActivityLog();
        }

        LastUpdatedAt = DateTime.UtcNow;
        return true;
    }

    /// <summary>
    /// Replaces the current state with one that can't be undone past (an administrative reset):
    /// the undo history and any pending undo request are discarded.
    /// </summary>
    public void PushCheckpoint(GameState newState)
    {
        EnsureStateVersions();
        StateHistory.Clear();
        newState.StateVersion = ++LatestStateVersion;
        CurrentState = newState;
        DrainActivityLog();
        ClearPendingUndo();
        LastUpdatedAt = DateTime.UtcNow;
    }

    public void ClearPendingUndo()
    {
        PendingUndoRequestBy = null;
        UndoRequestedAt = null;
    }
}
