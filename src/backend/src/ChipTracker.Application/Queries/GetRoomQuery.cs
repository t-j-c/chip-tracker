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
    public RoomInfoDto? RoomInfo { get; set; }
    public string? Error { get; set; }
}

public class RoomInfoDto
{
    public string RoomCode { get; set; } = string.Empty;
    public List<PlayerDto> Players { get; set; } = [];
    public int StartingStack { get; set; }
    public int SmallBlind { get; set; }
    public int BigBlind { get; set; }
    public int MaxPlayers { get; set; }
    public bool IsGameStarted { get; set; }
    public string? CreatorPlayerId { get; set; }
}
