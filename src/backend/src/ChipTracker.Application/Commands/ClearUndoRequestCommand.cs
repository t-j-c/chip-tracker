using MediatR;

namespace ChipTracker.Application.Commands;

public class ClearUndoRequestCommand : IRequest<ClearUndoRequestResult>, IRoomCommand
{
    public string RoomCode { get; set; } = string.Empty;
    public string PlayerId { get; set; } = string.Empty;
    public bool IsCancel { get; set; }
}

public class ClearUndoRequestResult
{
    public bool Success { get; set; }
    public long Revision { get; set; }
    public ChipTracker.Application.DTOs.RoomSnapshot? Snapshot { get; set; }
    public string? Error { get; set; }
}
