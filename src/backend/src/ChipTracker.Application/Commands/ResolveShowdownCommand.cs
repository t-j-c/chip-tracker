using MediatR;

namespace ChipTracker.Application.Commands;

public class ResolveShowdownCommand : IRequest<ResolveShowdownResult>
{
    public string RoomCode { get; set; } = string.Empty;
    public string WinnerPlayerId { get; set; } = string.Empty;
}

public class ResolveShowdownResult
{
    public bool Success { get; set; }
    public string? Error { get; set; }
    public object? GameState { get; set; }
}
