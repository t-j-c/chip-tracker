using ChipTracker.Domain.Enums;

namespace ChipTracker.Domain.Entities;

public class GameState
{
    public List<Player> Players { get; set; } = [];
    public int Pot { get; set; }
    public int CurrentBet { get; set; }
    public string? ActivePlayerTurnId { get; set; }
    public GamePhase Phase { get; set; }
    public int DealerIndex { get; set; }
    public int SmallBlind { get; set; }
    public int BigBlind { get; set; }
    public int MinRaise { get; set; }
    public bool IsHandActive { get; set; }
    /// <summary>
    /// The player who acts first this betting street. Used to detect when a
    /// check-around completes the street (all players have had a chance to act).
    /// </summary>
    public string? StreetFirstActorId { get; set; }

    /// <summary>
    /// The pots awaiting winner selection at showdown. Populated when the hand reaches
    /// Showdown (built from each in-hand player's whole-hand contribution). A single pot
    /// means no side pots were needed; multiple pots mean one or more all-ins at different
    /// stack depths split the contested chips into a main pot and side pot(s).
    /// </summary>
    public List<PotShare> Pots { get; set; } = [];

    /// <summary>
    /// Creates a deep copy of this game state.
    /// </summary>
    public GameState Clone()
    {
        return new GameState
        {
            Players = Players.Select(p => p.Clone()).ToList(),
            Pot = Pot,
            CurrentBet = CurrentBet,
            ActivePlayerTurnId = ActivePlayerTurnId,
            Phase = Phase,
            DealerIndex = DealerIndex,
            SmallBlind = SmallBlind,
            BigBlind = BigBlind,
            MinRaise = MinRaise,
            IsHandActive = IsHandActive,
            StreetFirstActorId = StreetFirstActorId,
            Pots = Pots.Select(p => p.Clone()).ToList()
        };
    }
}
