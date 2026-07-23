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
}
