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

        var snapshot = RoomSnapshot.From(room);
        return new GetRoomResult
        {
            Success = true,
            Revision = snapshot.Revision,
            GameState = snapshot.GameState,
            RoomInfo = snapshot.RoomInfo
        };
    }
}
