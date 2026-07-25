using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Engine;
using MediatR;

namespace ChipTracker.Application.Commands;

public class ProcessActionCommandHandler : IRequestHandler<ProcessActionCommand, ProcessActionResult>
{
    private readonly IRoomRepository _roomRepository;
    private readonly IGameNotifier _notifier;

    public ProcessActionCommandHandler(IRoomRepository roomRepository, IGameNotifier notifier)
    {
        _roomRepository = roomRepository;
        _notifier = notifier;
    }

    public async Task<ProcessActionResult> Handle(ProcessActionCommand request, CancellationToken cancellationToken)
    {
        // Fetch room
        var room = await _roomRepository.GetByRoomCodeAsync(request.RoomCode, cancellationToken);
        if (room == null)
        {
            await _notifier.NotifyError("", "Room not found");
            return new ProcessActionResult { Success = false, Error = "Room not found" };
        }

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
        {
            await _notifier.NotifyError("", result.Error ?? "Invalid action");
            return new ProcessActionResult { Success = false, Error = result.Error };
        }

        // Push new state
        room.PushState(result.Value!);

        // Save
        await _roomRepository.SaveAsync(room, cancellationToken);

        // Broadcast
        await _notifier.NotifyGameStateUpdated(request.RoomCode, room.CurrentState);

        return new ProcessActionResult { Success = true, GameState = GameStateDto.MapFromDomain(room.CurrentState) };
    }
}
