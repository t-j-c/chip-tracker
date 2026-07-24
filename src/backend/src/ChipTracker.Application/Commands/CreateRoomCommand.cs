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
    /// <summary>Player ID for the first player (room creator), so the frontend can identify them.</summary>
    public string? Player1Id { get; set; }
    /// <summary>Player ID for the second player.</summary>
    public string? Player2Id { get; set; }
}
