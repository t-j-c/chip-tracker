using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Engine;
using MediatR;

namespace ChipTracker.Application.Commands;

public class StartGameCommand : IRequest<StartGameResult>
{
    public string RoomCode { get; set; } = string.Empty;
    public string PlayerId { get; set; } = string.Empty;
}

public class StartGameResult
{
    public bool Success { get; set; }
    public GameStateDto? GameState { get; set; }
    public string? Error { get; set; }
}

public class StartGameCommandHandler : IRequestHandler<StartGameCommand, StartGameResult>
{
    private readonly IRoomRepository _roomRepository;
    private readonly IGameNotifier _notifier;

    public StartGameCommandHandler(IRoomRepository roomRepository, IGameNotifier notifier)
    {
        _roomRepository = roomRepository;
        _notifier = notifier;
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
        room.LastUpdatedAt = DateTime.UtcNow;

        await _roomRepository.SaveAsync(room, cancellationToken);

        var dto = GameStateDto.MapFromDomain(initialState);
        await _notifier.NotifyGameStarted(request.RoomCode, dto);

        return new StartGameResult { Success = true, GameState = dto };
    }
}
