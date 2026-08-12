namespace ChipTracker.Domain.Entities;

/// <summary>
/// A single pot (main pot or a side pot) awaiting winner selection at showdown.
/// Created when players have contributed unequal amounts due to one or more all-ins.
/// </summary>
public class PotShare
{
    public int Amount { get; set; }

    /// <summary>
    /// Player IDs who are still in the hand (not folded) and contributed enough to be
    /// eligible to win this pot.
    /// </summary>
    public List<string> EligiblePlayerIds { get; set; } = [];

    /// <summary>
    /// Creates a deep copy of this pot share.
    /// </summary>
    public PotShare Clone()
    {
        return new PotShare
        {
            Amount = Amount,
            EligiblePlayerIds = [.. EligiblePlayerIds]
        };
    }
}
