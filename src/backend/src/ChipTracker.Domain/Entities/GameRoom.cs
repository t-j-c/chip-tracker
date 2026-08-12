namespace ChipTracker.Domain.Entities;

public class GameRoom
{
    public string RoomCode { get; set; } = string.Empty;
    public List<Player> Players { get; set; } = [];
    public GameState? CurrentState { get; set; }
    /// <summary>
    /// Alias for CurrentState (used in tests and for consistency).
    /// </summary>
    public GameState? GameState
    {
        get => CurrentState;
        set => CurrentState = value;
    }
    public List<GameState> StateHistory { get; set; } = [];
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

    public bool IsGameStarted => CurrentState != null;

    /// <summary>
    /// Pushes the current state to history and replaces with new state.
    /// </summary>
    public void PushState(GameState newState)
    {
        if (CurrentState != null)
            StateHistory.Add(CurrentState.Clone());
        CurrentState = newState;
        GameState = newState;  // Keep alias in sync
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

        var stateVersion = StateHistory.Count + 1;  // +1 for current state

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
    /// Pops the last state from history and restores it as current.
    /// </summary>
    public bool UndoLastAction()
    {
        if (StateHistory.Count == 0)
            return false;

        CurrentState = StateHistory[^1];
        StateHistory.RemoveAt(StateHistory.Count - 1);
        
        // Mark activity entries as undone if they were created in the popped state
        foreach (var entry in ActivityLog)
        {
            if (entry.StateVersion > StateHistory.Count)
            {
                entry.IsUndone = true;
            }
        }
        
        ClearPendingUndo();
        LastUpdatedAt = DateTime.UtcNow;
        return true;
    }

    public void ClearPendingUndo()
    {
        PendingUndoRequestBy = null;
        UndoRequestedAt = null;
    }
}
