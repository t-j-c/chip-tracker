using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Engine;
using MediatR;

namespace ChipTracker.Application.Commands;

/// <summary>
/// Handles a busted player choosing to cash out instead of rebuying, marking them eliminated.
/// </summary>
public class DeclineRebuyCommandHandler : IRequestHandler<DeclineRebuyCommand, DeclineRebuyResult>
{
    private readonly IRoomRepository _roomRepository;
    private readonly IGameNotifier _notifier;

    public DeclineRebuyCommandHandler(IRoomRepository roomRepository, IGameNotifier notifier)
    {
        _roomRepository = roomRepository;
        _notifier = notifier;
    }

    public async Task<DeclineRebuyResult> Handle(DeclineRebuyCommand request, CancellationToken cancellationToken)
    {
        var room = await _roomRepository.GetByRoomCodeAsync(request.RoomCode, cancellationToken);
        if (room == null)
            return new DeclineRebuyResult { Success = false, Error = "Room not found" };

        if (room.CurrentState == null)
            return new DeclineRebuyResult { Success = false, Error = "Game has not started" };

        var result = GameEngine.ApplyCashOut(room.CurrentState, request.PlayerId);
        if (!result.IsSuccess)
        {
            await _notifier.NotifyError("", result.Error ?? "Cash out failed");
            return new DeclineRebuyResult { Success = false, Error = result.Error };
        }

        room.PushState(result.Value!);

        await _roomRepository.SaveAsync(room, cancellationToken);
        await _notifier.NotifyGameStateUpdated(request.RoomCode, room.CurrentState);

        return new DeclineRebuyResult { Success = true, GameState = GameStateDto.MapFromDomain(room.CurrentState) };
    }
}
