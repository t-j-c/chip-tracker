using ChipTracker.Application.Interfaces;
using MediatR;

namespace ChipTracker.Application.Commands;

/// <summary>
/// Changes the seating order. Before the game starts it decides who deals first; during a hand
/// it is held until the next hand is dealt. Not undoable.
/// </summary>
public class ReorderSeatsCommandHandler : IRequestHandler<ReorderSeatsCommand, ReorderSeatsResult>
{
    private readonly IRoomRepository _roomRepository;
    private readonly RoomEventDispatcher _events;

    public ReorderSeatsCommandHandler(IRoomRepository roomRepository, RoomEventDispatcher events)
    {
        _roomRepository = roomRepository;
        _events = events;
    }

    public async Task<ReorderSeatsResult> Handle(ReorderSeatsCommand request, CancellationToken cancellationToken)
    {
        var room = await _roomRepository.GetByRoomCodeAsync(request.RoomCode, cancellationToken);
        if (room == null)
            return new ReorderSeatsResult { Success = false, Error = "Room not found" };

        if (room.CreatorPlayerId != request.PlayerId)
            return new ReorderSeatsResult { Success = false, Error = "Only the room creator can change the seating order" };

        if (!room.SetSeatOrder(request.OrderedPlayerIds, request.PlayerId))
            return new ReorderSeatsResult { Success = false, Error = "The seating order must list every player exactly once" };

        await _roomRepository.SaveAsync(room, cancellationToken);
        var snapshot = await _events.PublishAsync(RoomEventTypes.SeatsReordered, room, request.PlayerId, cancellationToken);

        return new ReorderSeatsResult { Success = true, Revision = room.Revision, Snapshot = snapshot };
    }
}
