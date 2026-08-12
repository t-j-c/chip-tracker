namespace ChipTracker.Domain.Entities;

/// <summary>
/// A winner (or tied winners, for a split) assigned to one pot at showdown.
/// </summary>
public class PotAward
{
    public int PotIndex { get; set; }
    public List<string> WinnerPlayerIds { get; set; } = [];
}
