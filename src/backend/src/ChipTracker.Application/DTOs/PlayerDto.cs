namespace ChipTracker.Application.DTOs;

public class PlayerDto
{
    public string PlayerId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int Stack { get; set; }
    public int CurrentBet { get; set; }
    public bool HasFolded { get; set; }
    public bool IsAllIn { get; set; }
    public bool IsDealer { get; set; }
    public bool IsAwaitingRebuy { get; set; }
    public bool IsEliminated { get; set; }
}
