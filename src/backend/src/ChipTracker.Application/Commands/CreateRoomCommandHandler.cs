using System.Security.Cryptography;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using MediatR;

namespace ChipTracker.Application.Commands;

public class CreateRoomCommandHandler : IRequestHandler<CreateRoomCommand, CreateRoomResult>
{
    private readonly IRoomRepository _roomRepository;

    public CreateRoomCommandHandler(IRoomRepository roomRepository)
    {
        _roomRepository = roomRepository;
    }

    public async Task<CreateRoomResult> Handle(CreateRoomCommand request, CancellationToken cancellationToken)
    {
        // Validate
        if (request.StartingStack <= 0)
            return new CreateRoomResult { Success = false, Error = "Starting stack must be greater than 0" };

        if (request.SmallBlind <= 0 || request.BigBlind <= 0 || request.BigBlind != request.SmallBlind * 2)
            return new CreateRoomResult { Success = false, Error = "BigBlind must be exactly 2x SmallBlind" };

        // Create empty room — players join separately
        var room = new GameRoom
        {
            RoomCode = GenerateRoomCode(),
            Players = [],
            CurrentState = null,
            StartingStack = request.StartingStack,
            SmallBlind = request.SmallBlind,
            BigBlind = request.BigBlind,
            MaxPlayers = 9,
            CreatedAt = DateTime.UtcNow,
            LastUpdatedAt = DateTime.UtcNow
        };

        var roomCode = string.Empty;
        for (var attempt = 0; attempt < 5; attempt++)
        {
            room.RoomCode = GenerateRoomCode();
            if (await _roomRepository.TryCreateAsync(room, cancellationToken))
            {
                roomCode = room.RoomCode;
                break;
            }
        }

        if (roomCode.Length == 0)
            return new CreateRoomResult { Success = false, Error = "Could not allocate a room code, please try again" };

        return new CreateRoomResult { Success = true, RoomCode = roomCode };
    }

    private static string GenerateRoomCode() =>
        RandomNumberGenerator.GetString("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 6);
}
