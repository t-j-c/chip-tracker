using MediatR;

namespace ChipTracker.Application.Commands;

public class DeclineRebuyCommand : IRequest<DeclineRebuyResult>
{
    public string RoomCode { get; set; } = string.Empty;
    public string PlayerId { get; set; } = string.Empty;
}

public class DeclineRebuyResult
{
    public bool Success { get; set; }
    public string? Error { get; set; }
    public object? GameState { get; set; }
}
