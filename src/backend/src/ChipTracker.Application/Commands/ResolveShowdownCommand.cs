using MediatR;

namespace ChipTracker.Application.Commands;

public class ResolveShowdownCommand : IRequest<ResolveShowdownResult>
{
    public string RoomCode { get; set; } = string.Empty;
    /// <summary>Winner's player ID. Ignored when IsSplit is true.</summary>
    public string WinnerPlayerId { get; set; } = string.Empty;
    /// <summary>When true, pot is split evenly between all non-folded players.</summary>
    public bool IsSplit { get; set; } = false;
}

public class ResolveShowdownResult
{
    public bool Success { get; set; }
    public string? Error { get; set; }
    public object? GameState { get; set; }
}
