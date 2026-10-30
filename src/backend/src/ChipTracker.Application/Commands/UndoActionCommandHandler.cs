using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using MediatR;

namespace ChipTracker.Application.Commands;

public class UndoActionCommandHandler : IRequestHandler<UndoActionCommand, UndoActionResult>
{
    private readonly IRoomRepository _roomRepository;
    private readonly RoomEventDispatcher _events;

    public UndoActionCommandHandler(IRoomRepository roomRepository, RoomEventDispatcher events)
    {
        _roomRepository = roomRepository;
        _events = events;
    }

    public async Task<UndoActionResult> Handle(UndoActionCommand request, CancellationToken cancellationToken)
    {
        // Fetch room
        var room = await _roomRepository.GetByRoomCodeAsync(request.RoomCode, cancellationToken);
        if (room == null)
            return new UndoActionResult { Success = false, Error = "Room not found" };

        if (room.PendingUndoRequestBy == null)
            return new UndoActionResult { Success = false, Error = "No pending undo request" };

        if (room.PendingUndoRequestBy == request.PlayerId)
            return new UndoActionResult { Success = false, Error = "Cannot approve your own undo request" };

        // Undo last action
        var undoSuccess = room.UndoLastAction();
        if (!undoSuccess)
            return new UndoActionResult { Success = false, Error = "No actions to undo" };

        // Save
        await _roomRepository.SaveAsync(room, cancellationToken);

        var snapshot = await _events.PublishAsync(RoomEventTypes.GameStateUpdated, room, request.PlayerId, cancellationToken);

        return new UndoActionResult { Success = true, Revision = room.Revision, Snapshot = snapshot, GameState = snapshot.GameState };
    }
}
