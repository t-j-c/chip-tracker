using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Engine;
using MediatR;

namespace ChipTracker.Application.Commands;

public class ProcessActionCommandHandler : IRequestHandler<ProcessActionCommand, ProcessActionResult>
{
    private readonly IRoomRepository _roomRepository;
    private readonly RoomEventDispatcher _events;

    public ProcessActionCommandHandler(IRoomRepository roomRepository, RoomEventDispatcher events)
    {
        _roomRepository = roomRepository;
        _events = events;
    }

    public async Task<ProcessActionResult> Handle(ProcessActionCommand request, CancellationToken cancellationToken)
    {
        // Fetch room
        var room = await _roomRepository.GetByRoomCodeAsync(request.RoomCode, cancellationToken);
        if (room == null)
            return new ProcessActionResult { Success = false, Error = "Room not found" };

        if (room.CurrentState == null)
            return new ProcessActionResult { Success = false, Error = "Game has not started" };

        // Create action request
        var actionRequest = new ActionRequest
        {
            PlayerId = request.PlayerId,
            Action = request.Action,
            Amount = request.Amount
        };

        // Validate action
        var result = GameEngine.ValidateAction(room.CurrentState, actionRequest);
        if (!result.IsSuccess)
            return new ProcessActionResult { Success = false, Error = result.Error };

        // Push new state
        room.PushState(result.Value!);

        // Save
        await _roomRepository.SaveAsync(room, cancellationToken);

        var snapshot = await _events.PublishAsync(RoomEventTypes.GameStateUpdated, room, request.PlayerId, cancellationToken);

        return new ProcessActionResult { Success = true, Revision = room.Revision, Snapshot = snapshot, GameState = snapshot.GameState };
    }
}
