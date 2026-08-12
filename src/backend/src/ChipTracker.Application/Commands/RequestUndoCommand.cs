using MediatR;

namespace ChipTracker.Application.Commands;

public class RequestUndoCommand : IRequest<RequestUndoResult>
{
    public string RoomCode { get; set; } = string.Empty;
    public string PlayerId { get; set; } = string.Empty;
}

public class RequestUndoResult
{
    public bool Success { get; set; }
    public string? Error { get; set; }
}
