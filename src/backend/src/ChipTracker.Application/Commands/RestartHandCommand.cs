using MediatR;

namespace ChipTracker.Application.Commands;

/// <summary>Room creator abandons the current hand and re-deals it (see GameEngine.RestartHand).</summary>
public class RestartHandCommand : IRequest<RestartHandResult>, IRoomCommand
{
    public string RoomCode { get; set; } = string.Empty;
    public string PlayerId { get; set; } = string.Empty;
}

public class RestartHandResult
{
    public bool Success { get; set; }
    public long Revision { get; set; }
    public ChipTracker.Application.DTOs.RoomSnapshot? Snapshot { get; set; }
    public string? Error { get; set; }
}
