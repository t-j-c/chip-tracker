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
    private readonly RoomEventDispatcher _events;

    public RebuyCommandHandler(IRoomRepository roomRepository, RoomEventDispatcher events)
    {
        _roomRepository = roomRepository;
        _events = events;
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
            return new RebuyResult { Success = false, Error = result.Error };
        }

        room.PushState(result.Value!);

        await _roomRepository.SaveAsync(room, cancellationToken);
        var snapshot = await _events.PublishAsync(RoomEventTypes.GameStateUpdated, room, request.PlayerId, cancellationToken);

        return new RebuyResult { Success = true, Revision = room.Revision, Snapshot = snapshot, GameState = snapshot.GameState };
    }
}
