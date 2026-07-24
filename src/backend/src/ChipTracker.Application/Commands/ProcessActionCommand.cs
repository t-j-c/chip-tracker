using ChipTracker.Domain.Enums;
using MediatR;

namespace ChipTracker.Application.Commands;

public class ProcessActionCommand : IRequest<ProcessActionResult>
{
    public string RoomCode { get; set; } = string.Empty;
    public string PlayerId { get; set; } = string.Empty;
    public PokerAction Action { get; set; }
    public int? Amount { get; set; }
}

public class ProcessActionResult
{
    public bool Success { get; set; }
    public string? Error { get; set; }
    public object? GameState { get; set; }
}
