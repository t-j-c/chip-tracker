namespace ChipTracker.Application.DTOs;

public class PotAwardDto
{
    public int PotIndex { get; set; }
    public List<string> WinnerPlayerIds { get; set; } = [];
}
