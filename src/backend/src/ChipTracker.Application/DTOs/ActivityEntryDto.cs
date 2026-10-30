using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Enums;

namespace ChipTracker.Application.DTOs;

/// <summary>
/// DTO for activity log entries, serialized to clients.
/// </summary>
public record ActivityEntryDto(
    int Sequence,
    ActivityEntryType EntryType,
    string? PlayerId,
    PokerAction? Action,
    int Amount,
    GamePhase? OldPhase,
    GamePhase? NewPhase,
    int StateVersion,
    bool IsUndone,
    string? PlayerName = null,
    GamePhase? Phase = null,
    int? PotIndex = null,
    BlindType? BlindType = null,
    int HandNumber = 0
)
{
    /// <summary>
    /// Creates a human-readable description of the activity entry.
    /// </summary>
    public string GetDescription() => EntryType switch
    {
        ActivityEntryType.PlayerAction => Action switch
        {
            PokerAction.Fold => $"{PlayerId} folds",
            PokerAction.Check => $"{PlayerId} checks",
            PokerAction.Call => $"{PlayerId} calls {Amount}",
            PokerAction.Bet => $"{PlayerId} bets {Amount}",
            PokerAction.Raise => $"{PlayerId} raises to {Amount}",
            PokerAction.AllIn => $"{PlayerId} goes all-in with {Amount}",
            _ => $"{PlayerId} acts"
        },
        ActivityEntryType.PhaseAdvanced => $"Advancing from {OldPhase} to {NewPhase}",
        ActivityEntryType.PotWon => $"{PlayerId} wins pot ({Amount} chips)",
        ActivityEntryType.BlindPosted => $"{PlayerId} posts blind ({Amount})",
        ActivityEntryType.Refund => $"{PlayerId} receives refund ({Amount})",
        ActivityEntryType.Rebuy => $"{PlayerId} rebuys for {Amount}",
        ActivityEntryType.CashOut => $"{PlayerId} cashes out",
        ActivityEntryType.HandStarted => "New hand started",
        _ => "Unknown activity"
    };

    /// <summary>
    /// Creates a DTO from a domain ActivityEntry.
    /// </summary>
    public static ActivityEntryDto MapFromDomain(ActivityEntry entry)
    {
        return new ActivityEntryDto(
            Sequence: entry.Sequence,
            EntryType: entry.EntryType,
            PlayerId: entry.PlayerId,
            Action: entry.Action,
            Amount: entry.Amount,
            OldPhase: entry.OldPhase,
            NewPhase: entry.NewPhase,
            StateVersion: entry.StateVersion,
            IsUndone: entry.IsUndone,
            PlayerName: entry.PlayerName,
            Phase: entry.Phase,
            PotIndex: entry.PotIndex,
            BlindType: entry.BlindType,
            HandNumber: entry.HandNumber
        );
    }
}
