using MediatR;

namespace ChipTracker.Application.Commands;

public class CreateRoomCommand : IRequest<CreateRoomResult>
{
    public List<CreatePlayerRequest> Players { get; set; } = [];
    public int SmallBlind { get; set; }
    public int BigBlind { get; set; }
}

public class CreatePlayerRequest
{
    public string Name { get; set; } = string.Empty;
    public int Stack { get; set; }
}

public class CreateRoomResult
{
    public bool Success { get; set; }
    public string? RoomCode { get; set; }
    public string? Error { get; set; }
}
