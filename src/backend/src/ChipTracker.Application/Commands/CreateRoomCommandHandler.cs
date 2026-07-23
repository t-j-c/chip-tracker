using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Engine;
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
        if (request.Players.Count != 2)
            return new CreateRoomResult
            {
                Success = false,
                Error = "Game requires exactly 2 players"
            };

        if (request.SmallBlind <= 0 || request.BigBlind <= 0 || request.BigBlind != request.SmallBlind * 2)
            return new CreateRoomResult
            {
                Success = false,
                Error = "BigBlind must be exactly 2x SmallBlind"
            };

        // Create players
        var players = request.Players.Select((p, idx) => new Player
        {
            PlayerId = Guid.NewGuid().ToString(),
            Name = p.Name,
            Stack = p.Stack,
            CurrentBet = 0,
            HasFolded = false,
            IsAllIn = false,
            IsDealer = idx == 0
        }).ToList();

        // Create room and initial state
        var room = new GameRoom
        {
            RoomCode = GenerateRoomCode(),
            Players = players,
            CurrentState = GameEngine.CreateInitialState(players, request.SmallBlind, request.BigBlind, 0),
            CreatedAt = DateTime.UtcNow,
            LastUpdatedAt = DateTime.UtcNow
        };

        // Save
        var roomCode = await _roomRepository.CreateAsync(room, cancellationToken);

        return new CreateRoomResult
        {
            Success = true,
            RoomCode = roomCode
        };
    }

    private static string GenerateRoomCode()
    {
        const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        var result = new char[6];
        var random = new Random();
        for (int i = 0; i < 6; i++)
            result[i] = chars[random.Next(chars.Length)];
        return new string(result);
    }
}
