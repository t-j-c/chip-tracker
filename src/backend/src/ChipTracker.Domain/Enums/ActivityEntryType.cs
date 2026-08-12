using System.Text.Json.Serialization;

namespace ChipTracker.Domain.Enums;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ActivityEntryType
{
    PlayerAction,
    PhaseAdvanced,
    PotWon,
    BlindPosted,
    Refund,
    Rebuy,
    CashOut,
    HandStarted
}
