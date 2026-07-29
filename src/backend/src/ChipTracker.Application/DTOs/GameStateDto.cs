using ChipTracker.Domain.Entities;

namespace ChipTracker.Application.DTOs;

public class GameStateDto
{
    public List<PlayerDto> Players { get; set; } = [];
    public int Pot { get; set; }
    public int CurrentBet { get; set; }
    public string? ActivePlayerTurnId { get; set; }
    public string Phase { get; set; } = "PreFlop";
    public int DealerIndex { get; set; }
    public int SmallBlind { get; set; }
    public int BigBlind { get; set; }
    public int MinRaise { get; set; }
    public bool IsHandActive { get; set; }
    public List<PotShareDto> Pots { get; set; } = [];

    public static GameStateDto MapFromDomain(GameState state)
    {
        return new GameStateDto
        {
            Players = state.Players.Select(p => new PlayerDto
            {
                PlayerId = p.PlayerId,
                Name = p.Name,
                Stack = p.Stack,
                CurrentBet = p.CurrentBet,
                HasFolded = p.HasFolded,
                IsAllIn = p.IsAllIn,
                IsDealer = p.IsDealer,
                IsAwaitingRebuy = p.IsAwaitingRebuy,
                IsEliminated = p.IsEliminated
            }).ToList(),
            Pot = state.Pot,
            CurrentBet = state.CurrentBet,
            ActivePlayerTurnId = state.ActivePlayerTurnId,
            Phase = state.Phase.ToString(),
            DealerIndex = state.DealerIndex,
            SmallBlind = state.SmallBlind,
            BigBlind = state.BigBlind,
            MinRaise = state.MinRaise,
            IsHandActive = state.IsHandActive,
            Pots = state.Pots.Select(p => new PotShareDto
            {
                Amount = p.Amount,
                EligiblePlayerIds = p.EligiblePlayerIds
            }).ToList()
        };
    }
}
