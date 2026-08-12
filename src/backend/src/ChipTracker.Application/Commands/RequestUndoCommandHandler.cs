using ChipTracker.Application.Interfaces;
using MediatR;

namespace ChipTracker.Application.Commands;

public class RequestUndoCommandHandler : IRequestHandler<RequestUndoCommand, RequestUndoResult>
{
    private readonly IRoomRepository _roomRepository;
    private readonly IGameNotifier _notifier;

    public RequestUndoCommandHandler(IRoomRepository roomRepository, IGameNotifier notifier)
    {
        _roomRepository = roomRepository;
        _notifier = notifier;
    }

    public async Task<RequestUndoResult> Handle(RequestUndoCommand request, CancellationToken cancellationToken)
    {
        var room = await _roomRepository.GetByRoomCodeAsync(request.RoomCode, cancellationToken);
        if (room == null)
            return new RequestUndoResult { Success = false, Error = "Room not found" };

        if (!room.Players.Any(p => p.PlayerId == request.PlayerId))
            return new RequestUndoResult { Success = false, Error = "Player not in room" };

        if (room.StateHistory.Count == 0)
            return new RequestUndoResult { Success = false, Error = "No actions to undo" };

        room.PendingUndoRequestBy = request.PlayerId;
        room.UndoRequestedAt = DateTime.UtcNow;

        await _roomRepository.SaveAsync(room, cancellationToken);
        await _notifier.NotifyUndoRequested(request.RoomCode, request.PlayerId);

        return new RequestUndoResult { Success = true };
    }
}
