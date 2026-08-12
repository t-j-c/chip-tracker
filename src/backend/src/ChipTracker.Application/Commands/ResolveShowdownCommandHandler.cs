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

        if (room.CurrentState == null)
            return new ResolveShowdownResult { Success = false, Error = "Game has not started" };

        var state = room.CurrentState;

        // Only allow resolution at showdown phase or when hand is already inactive (all-in runout)
        if (state.Phase != GamePhase.Showdown && state.IsHandActive)
            return new ResolveShowdownResult { Success = false, Error = "Hand is still in progress" };

        // Clone before mutating: ResolveShowdown/ResolveSplitPot/AwardPots mutate in place, so
        // PushState must be given a distinct object from room.CurrentState or the pre-resolution
        // showdown state pushed into history would already reflect the post-resolution result,
        // breaking undo.
        GameState newState;
        if (request.Awards.Count > 0)
        {
            var result = GameEngine.AwardPots(state.Clone(), request.Awards);
            if (!result.IsSuccess)
                return new ResolveShowdownResult { Success = false, Error = result.Error };

            newState = result.Value!;
        }
        else if (request.IsSplit)
        {
            newState = GameEngine.ResolveSplitPot(state.Clone());
        }
        else
        {
            if (!room.Players.Any(p => p.PlayerId == request.WinnerPlayerId))
                return new ResolveShowdownResult { Success = false, Error = "Winner not found" };

            newState = GameEngine.ResolveShowdown(state.Clone(), request.WinnerPlayerId);
        }

        room.PushState(newState);

        await _roomRepository.SaveAsync(room, cancellationToken);
        await _notifier.NotifyGameStateUpdated(request.RoomCode, room.CurrentState);

        return new ResolveShowdownResult { Success = true, GameState = GameStateDto.MapFromDomain(room) };
    }
}
