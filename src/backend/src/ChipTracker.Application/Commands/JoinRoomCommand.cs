using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using MediatR;

namespace ChipTracker.Application.Commands;

public class JoinRoomCommand : IRequest<JoinRoomResult>
{
    public string RoomCode { get; set; } = string.Empty;
    public string PlayerName { get; set; } = string.Empty;
}

public class JoinRoomResult
{
    public bool Success { get; set; }
    public string? PlayerId { get; set; }
    public bool IsCreator { get; set; }
    public string? Error { get; set; }
}

public class JoinRoomCommandHandler : IRequestHandler<JoinRoomCommand, JoinRoomResult>
{
    private readonly IRoomRepository _roomRepository;
    private readonly IGameNotifier _notifier;

    public JoinRoomCommandHandler(IRoomRepository roomRepository, IGameNotifier notifier)
    {
        _roomRepository = roomRepository;
        _notifier = notifier;
    }

    public async Task<JoinRoomResult> Handle(JoinRoomCommand request, CancellationToken cancellationToken)
    {
        var room = await _roomRepository.GetByRoomCodeAsync(request.RoomCode, cancellationToken);
        if (room == null)
            return new JoinRoomResult { Success = false, Error = "Room not found" };

        if (room.IsGameStarted)
            return new JoinRoomResult { Success = false, Error = "Game has already started" };

        if (room.Players.Count >= room.MaxPlayers)
            return new JoinRoomResult { Success = false, Error = $"Room is full (max {room.MaxPlayers} players)" };

        var name = request.PlayerName.Trim();
        if (string.IsNullOrEmpty(name))
            return new JoinRoomResult { Success = false, Error = "Player name cannot be empty" };

        if (room.Players.Any(p => string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase)))
            return new JoinRoomResult { Success = false, Error = "A player with that name already exists" };

        var isCreator = room.Players.Count == 0;
        var player = new Player
        {
            PlayerId = Guid.NewGuid().ToString(),
            Name = name,
            Stack = room.StartingStack,
            CurrentBet = 0,
            HasFolded = false,
            IsAllIn = false,
            IsDealer = false
        };

        room.Players.Add(player);
        if (isCreator)
            room.CreatorPlayerId = player.PlayerId;

        room.LastUpdatedAt = DateTime.UtcNow;
        await _roomRepository.SaveAsync(room, cancellationToken);

        var playerDto = new PlayerDto
        {
            PlayerId = player.PlayerId,
            Name = player.Name,
            Stack = player.Stack,
            CurrentBet = 0,
            HasFolded = false,
            IsAllIn = false,
            IsDealer = false
        };
        await _notifier.NotifyPlayerJoined(request.RoomCode, playerDto, room.Players.Count);

        return new JoinRoomResult { Success = true, PlayerId = player.PlayerId, IsCreator = isCreator };
    }
}
