using MediatR;

namespace ChipTracker.Application.Commands;

public class UndoActionCommand : IRequest<UndoActionResult>, IRoomCommand
{
    public string RoomCode { get; set; } = string.Empty;
    public string PlayerId { get; set; } = string.Empty;
}

public class UndoActionResult
{
    public bool Success { get; set; }
    public long Revision { get; set; }
    public ChipTracker.Application.DTOs.RoomSnapshot? Snapshot { get; set; }
    public string? Error { get; set; }
    public object? GameState { get; set; }
}
