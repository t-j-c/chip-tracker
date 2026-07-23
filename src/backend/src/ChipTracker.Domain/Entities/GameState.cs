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
            IsHandActive = IsHandActive
        };
    }
}
