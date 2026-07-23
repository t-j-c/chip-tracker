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

        var gameStateDto = MapGameStateToDto(room.CurrentState);

        return new GetRoomResult { Success = true, GameState = gameStateDto };
    }

    private static GameStateDto MapGameStateToDto(Domain.Entities.GameState state)
    {
        return new GameStateDto
        {
            Players = state.Players.Select(p => new PlayerDto
            {
                PlayerId = p.PlayerId,
                Name = p.Name,
                Stack = p.Stack,
                CurrentBet = p.CurrentBet,
                HasFolded = p.HasFolded,
                IsAllIn = p.IsAllIn,
                IsDealer = p.IsDealer
            }).ToList(),
            Pot = state.Pot,
            CurrentBet = state.CurrentBet,
            ActivePlayerTurnId = state.ActivePlayerTurnId,
            Phase = state.Phase.ToString(),
            DealerIndex = state.DealerIndex,
            SmallBlind = state.SmallBlind,
            BigBlind = state.BigBlind,
            MinRaise = state.MinRaise,
            IsHandActive = state.IsHandActive
        };
    }
}
