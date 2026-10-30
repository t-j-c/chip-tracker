using ChipTracker.Application.Queries;
using ChipTracker.Domain.Entities;

namespace ChipTracker.Application.DTOs;

/// <summary>The single mapping of a room to what clients see: used by queries, command results and events.</summary>
public sealed record RoomSnapshot(long Revision, RoomInfoDto RoomInfo, GameStateDto? GameState)
{
    public static RoomSnapshot From(GameRoom room)
    {
        var roomInfo = new RoomInfoDto
        {
            RoomCode = room.RoomCode,
            Players = room.Players.Select(p => new PlayerDto
            {
                PlayerId = p.PlayerId,
                Name = p.Name,
                Stack = p.Stack,
                CurrentBet = p.CurrentBet,
                HasFolded = p.HasFolded,
                IsAllIn = p.IsAllIn,
                IsDealer = p.IsDealer
            }).ToList(),
            StartingStack = room.StartingStack,
            SmallBlind = room.SmallBlind,
            BigBlind = room.BigBlind,
            MaxPlayers = room.MaxPlayers,
            IsGameStarted = room.IsGameStarted,
            CreatorPlayerId = room.CreatorPlayerId
        };

        var gameState = room.IsGameStarted ? GameStateDto.MapFromDomain(room) : null;
        return new RoomSnapshot(room.Revision, roomInfo, gameState);
    }
}
