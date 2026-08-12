using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using MediatR;

namespace ChipTracker.Application.Queries;

public class GetRoomQueryHandler : IRequestHandler<GetRoomQuery, GetRoomResult>
{
    private readonly IRoomRepository _roomRepository;

    public GetRoomQueryHandler(IRoomRepository roomRepository)
    {
        _roomRepository = roomRepository;
    }

    public async Task<GetRoomResult> Handle(GetRoomQuery request, CancellationToken cancellationToken)
    {
        var room = await _roomRepository.GetByRoomCodeAsync(request.RoomCode, cancellationToken);
        if (room == null)
            return new GetRoomResult { Success = false, Error = "Room not found" };

        var roomInfo = new RoomInfoDto
        {
            RoomCode = room.RoomCode,
            Players = room.Players.Select(p => new PlayerDto
            {
                PlayerId = p.PlayerId,
                Name = p.Name,
                Stack = p.Stack,
                CurrentBet = p.CurrentBet,
                HasFolded = p.HasFolded,
                IsAllIn = p.IsAllIn,
                IsDealer = p.IsDealer
            }).ToList(),
            StartingStack = room.StartingStack,
            SmallBlind = room.SmallBlind,
            BigBlind = room.BigBlind,
            MaxPlayers = room.MaxPlayers,
            IsGameStarted = room.IsGameStarted,
            CreatorPlayerId = room.CreatorPlayerId
        };

        var gameState = room.IsGameStarted ? GameStateDto.MapFromDomain(room) : null;

        return new GetRoomResult { Success = true, GameState = gameState, RoomInfo = roomInfo };
    }
}
