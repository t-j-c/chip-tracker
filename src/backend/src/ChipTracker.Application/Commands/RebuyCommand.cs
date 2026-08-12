using MediatR;

namespace ChipTracker.Application.Commands;

public class RebuyCommand : IRequest<RebuyResult>
{
    public string RoomCode { get; set; } = string.Empty;
    public string PlayerId { get; set; } = string.Empty;
}

public class RebuyResult
{
    public bool Success { get; set; }
    public string? Error { get; set; }
    public object? GameState { get; set; }
}
