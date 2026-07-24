using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Engine;
using MediatR;

namespace ChipTracker.Application.Commands;

public class ResolveShowdownCommandHandler : IRequestHandler<ResolveShowdownCommand, ResolveShowdownResult>
{
    private readonly IRoomRepository _roomRepository;
    private readonly IGameNotifier _notifier;

    public ResolveShowdownCommandHandler(IRoomRepository roomRepository, IGameNotifier notifier)
    {
        _roomRepository = roomRepository;
        _notifier = notifier;
    }

    public async Task<ResolveShowdownResult> Handle(ResolveShowdownCommand request, CancellationToken cancellationToken)
    {
        // Fetch room
        var room = await _roomRepository.GetByRoomCodeAsync(request.RoomCode, cancellationToken);
        if (room == null)
            return new ResolveShowdownResult { Success = false, Error = "Room not found" };

        // Verify winner exists
        if (!room.Players.Any(p => p.PlayerId == request.WinnerPlayerId))
            return new ResolveShowdownResult { Success = false, Error = "Winner not found" };

        // Resolve showdown
        var newState = GameEngine.ResolveShowdown(room.CurrentState, request.WinnerPlayerId);
        room.PushState(newState);

        // Save
        await _roomRepository.SaveAsync(room, cancellationToken);

        // Broadcast
        await _notifier.NotifyGameStateUpdated(request.RoomCode, room.CurrentState);

        return new ResolveShowdownResult { Success = true, GameState = room.CurrentState };
    }
}
