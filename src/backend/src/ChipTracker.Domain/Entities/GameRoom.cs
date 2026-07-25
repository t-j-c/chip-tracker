namespace ChipTracker.Domain.Entities;

public class GameRoom
{
    public string RoomCode { get; set; } = string.Empty;
    public List<Player> Players { get; set; } = [];
    public GameState? CurrentState { get; set; }
    public List<GameState> StateHistory { get; set; } = [];
    public DateTime CreatedAt { get; set; }
    public DateTime LastUpdatedAt { get; set; }

    // Game settings stored at room creation
    public int StartingStack { get; set; }
    public int SmallBlind { get; set; }
    public int BigBlind { get; set; }
    public int MaxPlayers { get; set; } = 9;

    // First player to join becomes the creator and can start the game
    public string? CreatorPlayerId { get; set; }

    public bool IsGameStarted => CurrentState != null;

    /// <summary>
    /// Pushes the current state to history and replaces with new state.
    /// </summary>
    public void PushState(GameState newState)
    {
        if (CurrentState != null)
            StateHistory.Add(CurrentState.Clone());
        CurrentState = newState;
        LastUpdatedAt = DateTime.UtcNow;
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
        LastUpdatedAt = DateTime.UtcNow;
        return true;
    }
}
