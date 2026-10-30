using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using MediatR;

namespace ChipTracker.Application.Commands;

public class JoinRoomCommand : IRequest<JoinRoomResult>, IRoomCommand
{
    public string RoomCode { get; set; } = string.Empty;
    public string PlayerName { get; set; } = string.Empty;
}

public class JoinRoomResult
{
    public bool Success { get; set; }
    public long Revision { get; set; }
    public ChipTracker.Application.DTOs.RoomSnapshot? Snapshot { get; set; }
    public string? PlayerId { get; set; }
    public bool IsCreator { get; set; }
    public string? Error { get; set; }
}

public class JoinRoomCommandHandler : IRequestHandler<JoinRoomCommand, JoinRoomResult>
{
    private readonly IRoomRepository _roomRepository;
    private readonly RoomEventDispatcher _events;

    public JoinRoomCommandHandler(IRoomRepository roomRepository, RoomEventDispatcher events)
    {
        _roomRepository = roomRepository;
        _events = events;
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

        var snapshot = await _events.PublishAsync(RoomEventTypes.PlayerJoined, room, player.PlayerId, cancellationToken);

        return new JoinRoomResult { Success = true, PlayerId = player.PlayerId, IsCreator = isCreator, Revision = room.Revision, Snapshot = snapshot };
    }
}
