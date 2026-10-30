using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Engine;
using MediatR;

namespace ChipTracker.Application.Commands;

public class StartGameCommand : IRequest<StartGameResult>, IRoomCommand
{
    public string RoomCode { get; set; } = string.Empty;
    public string PlayerId { get; set; } = string.Empty;
}

public class StartGameResult
{
    public bool Success { get; set; }
    public long Revision { get; set; }
    public ChipTracker.Application.DTOs.RoomSnapshot? Snapshot { get; set; }
    public GameStateDto? GameState { get; set; }
    public string? Error { get; set; }
}

public class StartGameCommandHandler : IRequestHandler<StartGameCommand, StartGameResult>
{
    private readonly IRoomRepository _roomRepository;
    private readonly RoomEventDispatcher _events;

    public StartGameCommandHandler(IRoomRepository roomRepository, RoomEventDispatcher events)
    {
        _roomRepository = roomRepository;
        _events = events;
    }

    public async Task<StartGameResult> Handle(StartGameCommand request, CancellationToken cancellationToken)
    {
        var room = await _roomRepository.GetByRoomCodeAsync(request.RoomCode, cancellationToken);
        if (room == null)
            return new StartGameResult { Success = false, Error = "Room not found" };

        if (room.IsGameStarted)
            return new StartGameResult { Success = false, Error = "Game has already started" };

        if (room.CreatorPlayerId != request.PlayerId)
            return new StartGameResult { Success = false, Error = "Only the room creator can start the game" };

        if (room.Players.Count < 2)
            return new StartGameResult { Success = false, Error = "At least 2 players are required to start" };

        var initialState = GameEngine.CreateInitialState(room.Players, room.SmallBlind, room.BigBlind, dealerIndex: 0);
        room.CurrentState = initialState;
        // Drain the hand-start entries (blinds) so the activity log is populated from the first hand.
        room.PushState();
        room.LastUpdatedAt = DateTime.UtcNow;

        await _roomRepository.SaveAsync(room, cancellationToken);

        var snapshot = await _events.PublishAsync(RoomEventTypes.GameStarted, room, request.PlayerId, cancellationToken);

        return new StartGameResult { Success = true, Revision = room.Revision, Snapshot = snapshot, GameState = snapshot.GameState };
    }
}
