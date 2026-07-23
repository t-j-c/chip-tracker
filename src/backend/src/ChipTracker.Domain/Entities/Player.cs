namespace ChipTracker.Domain.Entities;

public class Player
{
    public string PlayerId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int Stack { get; set; }
    public int CurrentBet { get; set; }
    public bool HasFolded { get; set; }
    public bool IsAllIn { get; set; }
    public bool IsDealer { get; set; }

    /// <summary>
    /// Creates a deep copy of this player.
    /// </summary>
    public Player Clone()
    {
        return new Player
        {
            PlayerId = PlayerId,
            Name = Name,
            Stack = Stack,
            CurrentBet = CurrentBet,
            HasFolded = HasFolded,
            IsAllIn = IsAllIn,
            IsDealer = IsDealer
        };
    }
}
