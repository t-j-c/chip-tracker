namespace ChipTracker.Domain.Entities;

public class GameRoom
{
    public string RoomCode { get; set; } = string.Empty;
    public List<Player> Players { get; set; } = [];
    public GameState CurrentState { get; set; } = new();
    public List<GameState> StateHistory { get; set; } = [];
    public DateTime CreatedAt { get; set; }
    public DateTime LastUpdatedAt { get; set; }

    /// <summary>
    /// Pushes the current state to history and replaces with new state.
    /// </summary>
    public void PushState(GameState newState)
    {
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
