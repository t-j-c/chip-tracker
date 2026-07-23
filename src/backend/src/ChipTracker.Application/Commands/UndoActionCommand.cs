using MediatR;

namespace ChipTracker.Application.Commands;

public class UndoActionCommand : IRequest<UndoActionResult>
{
    public string RoomCode { get; set; } = string.Empty;
    public string PlayerId { get; set; } = string.Empty;
}

public class UndoActionResult
{
    public bool Success { get; set; }
    public string? Error { get; set; }
}
