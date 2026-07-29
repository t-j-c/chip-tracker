using MediatR;

namespace ChipTracker.Application.Commands;

public class ClearUndoRequestCommand : IRequest<ClearUndoRequestResult>
{
    public string RoomCode { get; set; } = string.Empty;
    public string PlayerId { get; set; } = string.Empty;
    public bool IsCancel { get; set; }
}

public class ClearUndoRequestResult
{
    public bool Success { get; set; }
    public string? Error { get; set; }
}
