using ChipTracker.Domain.Entities;
using MediatR;

namespace ChipTracker.Application.Commands;

public class ResolveShowdownCommand : IRequest<ResolveShowdownResult>
{
    public string RoomCode { get; set; } = string.Empty;
    /// <summary>Winner's player ID. Ignored when IsSplit is true or Awards is non-empty.</summary>
    public string WinnerPlayerId { get; set; } = string.Empty;
    /// <summary>When true, pot is split evenly between all non-folded players. Ignored when Awards is non-empty.</summary>
    public bool IsSplit { get; set; } = false;
    /// <summary>
    /// Per-pot winner assignments for hands with side pots. When non-empty, this takes
    /// precedence over WinnerPlayerId/IsSplit and every pot in the current state must have
    /// exactly one award.
    /// </summary>
    public List<PotAward> Awards { get; set; } = [];
}

public class ResolveShowdownResult
{
    public bool Success { get; set; }
    public string? Error { get; set; }
    public object? GameState { get; set; }
}
