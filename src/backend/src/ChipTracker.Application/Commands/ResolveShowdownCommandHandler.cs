using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Engine;
using ChipTracker.Domain.Enums;
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
        var room = await _roomRepository.GetByRoomCodeAsync(request.RoomCode, cancellationToken);
        if (room == null)
            return new ResolveShowdownResult { Success = false, Error = "Room not found" };

        var state = room.CurrentState;

        // Only allow resolution at showdown phase or when hand is already inactive (all-in runout)
        if (state.Phase != GamePhase.Showdown && state.IsHandActive)
            return new ResolveShowdownResult { Success = false, Error = "Hand is still in progress" };

        GameState newState;
        if (request.IsSplit)
        {
            newState = GameEngine.ResolveSplitPot(state);
        }
        else
        {
            if (!room.Players.Any(p => p.PlayerId == request.WinnerPlayerId))
                return new ResolveShowdownResult { Success = false, Error = "Winner not found" };

            newState = GameEngine.ResolveShowdown(state, request.WinnerPlayerId);
        }

        room.PushState(newState);

        await _roomRepository.SaveAsync(room, cancellationToken);
        await _notifier.NotifyGameStateUpdated(request.RoomCode, room.CurrentState);

        return new ResolveShowdownResult { Success = true, GameState = GameStateDto.MapFromDomain(room.CurrentState) };
    }
}
