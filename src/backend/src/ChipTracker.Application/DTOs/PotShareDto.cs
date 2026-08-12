namespace ChipTracker.Application.DTOs;

public class PotShareDto
{
    public int Amount { get; set; }
    public List<string> EligiblePlayerIds { get; set; } = [];
}
