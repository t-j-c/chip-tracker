using MediatR;

namespace ChipTracker.Application.Commands;

/// <summary>Room creator changes the clockwise seating order (lobby or mid-game).</summary>
public class ReorderSeatsCommand : IRequest<ReorderSeatsResult>, IRoomCommand
{
    public string RoomCode { get; set; } = string.Empty;
    public string PlayerId { get; set; } = string.Empty;
    public List<string> OrderedPlayerIds { get; set; } = [];
}

public class ReorderSeatsResult
{
    public bool Success { get; set; }
    public long Revision { get; set; }
    public ChipTracker.Application.DTOs.RoomSnapshot? Snapshot { get; set; }
    public string? Error { get; set; }
}
