using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Engine;
using MediatR;

namespace ChipTracker.Application.Commands;

/// <summary>
/// Admin override for a hand that went wrong: returns every chip bet this hand, keeps the same
/// dealer and re-posts the blinds. Players, stacks and seating are preserved. Not undoable.
/// </summary>
public class RestartHandCommandHandler : IRequestHandler<RestartHandCommand, RestartHandResult>
{
    private readonly IRoomRepository _roomRepository;
    private readonly RoomEventDispatcher _events;

    public RestartHandCommandHandler(IRoomRepository roomRepository, RoomEventDispatcher events)
    {
        _roomRepository = roomRepository;
        _events = events;
    }

    public async Task<RestartHandResult> Handle(RestartHandCommand request, CancellationToken cancellationToken)
    {
        var room = await _roomRepository.GetByRoomCodeAsync(request.RoomCode, cancellationToken);
        if (room == null)
            return new RestartHandResult { Success = false, Error = "Room not found" };

        if (room.CurrentState == null)
            return new RestartHandResult { Success = false, Error = "Game has not started" };

        if (room.CreatorPlayerId != request.PlayerId)
            return new RestartHandResult { Success = false, Error = "Only the room creator can restart the hand" };

        var result = GameEngine.RestartHand(room.CurrentState, request.PlayerId);
        if (!result.IsSuccess)
            return new RestartHandResult { Success = false, Error = result.Error };

        room.PushCheckpoint(result.Value!);

        await _roomRepository.SaveAsync(room, cancellationToken);
        var snapshot = await _events.PublishAsync(RoomEventTypes.HandRestarted, room, request.PlayerId, cancellationToken);

        return new RestartHandResult { Success = true, Revision = room.Revision, Snapshot = snapshot };
    }
}
