using ChipTracker.Domain.Enums;

namespace ChipTracker.Domain.Entities;

public class ActionRequest
{
    public string PlayerId { get; set; } = string.Empty;
    public PokerAction Action { get; set; }
    public int? Amount { get; set; }
}
