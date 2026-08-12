using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Engine;
using MediatR;

namespace ChipTracker.Application.Commands;

/// <summary>
/// Handles a player buying back in for the room's starting stack, whether they just busted
/// (still awaiting a decision) or were previously eliminated.
/// </summary>
public class RebuyCommandHandler : IRequestHandler<RebuyCommand, RebuyResult>
{
    private readonly IRoomRepository _roomRepository;
    private readonly IGameNotifier _notifier;

    public RebuyCommandHandler(IRoomRepository roomRepository, IGameNotifier notifier)
    {
        _roomRepository = roomRepository;
        _notifier = notifier;
    }

    public async Task<RebuyResult> Handle(RebuyCommand request, CancellationToken cancellationToken)
    {
        var room = await _roomRepository.GetByRoomCodeAsync(request.RoomCode, cancellationToken);
        if (room == null)
            return new RebuyResult { Success = false, Error = "Room not found" };

        if (room.CurrentState == null)
            return new RebuyResult { Success = false, Error = "Game has not started" };

        var result = GameEngine.ApplyRebuy(room.CurrentState, request.PlayerId, room.StartingStack);
        if (!result.IsSuccess)
        {
            await _notifier.NotifyError("", result.Error ?? "Rebuy failed");
            return new RebuyResult { Success = false, Error = result.Error };
        }

        room.PushState(result.Value!);

        await _roomRepository.SaveAsync(room, cancellationToken);
        await _notifier.NotifyGameStateUpdated(request.RoomCode, room.CurrentState);

        return new RebuyResult { Success = true, GameState = GameStateDto.MapFromDomain(room.CurrentState) };
    }
}
