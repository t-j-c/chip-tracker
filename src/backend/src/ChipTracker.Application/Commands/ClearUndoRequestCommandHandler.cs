using ChipTracker.Application.Interfaces;
using MediatR;

namespace ChipTracker.Application.Commands;

public class ClearUndoRequestCommandHandler : IRequestHandler<ClearUndoRequestCommand, ClearUndoRequestResult>
{
    private readonly IRoomRepository _roomRepository;
    private readonly RoomEventDispatcher _events;

    public ClearUndoRequestCommandHandler(IRoomRepository roomRepository, RoomEventDispatcher events)
    {
        _roomRepository = roomRepository;
        _events = events;
    }

    public async Task<ClearUndoRequestResult> Handle(ClearUndoRequestCommand request, CancellationToken cancellationToken)
    {
        var room = await _roomRepository.GetByRoomCodeAsync(request.RoomCode, cancellationToken);
        if (room == null)
            return new ClearUndoRequestResult { Success = false, Error = "Room not found" };

        if (room.PendingUndoRequestBy == null)
            return new ClearUndoRequestResult { Success = false, Error = "No pending undo request" };

        if (request.IsCancel && room.PendingUndoRequestBy != request.PlayerId)
            return new ClearUndoRequestResult { Success = false, Error = "Cancel is only allowed by the requester" };

        if (!request.IsCancel && room.PendingUndoRequestBy == request.PlayerId)
            return new ClearUndoRequestResult { Success = false, Error = "The requester cannot decline their own undo request" };

        room.ClearPendingUndo();
        await _roomRepository.SaveAsync(room, cancellationToken);

        var snapshot = await _events.PublishAsync(
            request.IsCancel ? RoomEventTypes.UndoCancelled : RoomEventTypes.UndoDeclined,
            room, request.PlayerId, cancellationToken);

        return new ClearUndoRequestResult { Success = true, Revision = room.Revision, Snapshot = snapshot };
    }
}
