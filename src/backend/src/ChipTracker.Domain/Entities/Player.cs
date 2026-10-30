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
    /// Whether this player has taken a voluntary action (check/call/bet/raise/all-in)
    /// since the current betting street began. Used to detect when a betting round
    /// is complete (every player still able to act has acted and matched the bet).
    /// </summary>
    public bool HasActedThisStreet { get; set; }

    /// <summary>
    /// Total chips this player has committed to the pot during the current hand,
    /// across all streets. Used for uncalled-bet refunds and side-pot calculation.
    /// </summary>
    public int TotalContributed { get; set; }

    /// <summary>
    /// True when this player's stack reached zero at the end of a hand and they must decide
    /// to rebuy or cash out before the next hand can start. While true, the player is still
    /// "seated" (counts toward dealer rotation position) but cannot be dealt into a new hand.
    /// </summary>
    public bool IsAwaitingRebuy { get; set; }

    /// <summary>
    /// True when this player has cashed out after busting. Eliminated players are excluded
    /// from blinds, dealer rotation, and turn order, but may buy back in at any time via a
    /// rebuy, which clears this flag and reseats them.
    /// </summary>
    public bool IsEliminated { get; set; }

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
            IsDealer = IsDealer,
            HasActedThisStreet = HasActedThisStreet,
            TotalContributed = TotalContributed,
            IsAwaitingRebuy = IsAwaitingRebuy,
            IsEliminated = IsEliminated
        };
    }
}
