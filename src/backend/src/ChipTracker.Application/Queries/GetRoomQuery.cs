using ChipTracker.Application.DTOs;
using MediatR;

namespace ChipTracker.Application.Queries;

public class GetRoomQuery : IRequest<GetRoomResult>
{
    public string RoomCode { get; set; } = string.Empty;
}

public class GetRoomResult
{
    public bool Success { get; set; }
    public GameStateDto? GameState { get; set; }
    public string? Error { get; set; }
}
