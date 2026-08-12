using ChipTracker.Application.Commands;
using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using FluentAssertions;
using NSubstitute;

namespace ChipTracker.Application.Tests;

public class StartGameCommandHandlerTests
{
    private readonly IRoomRepository _repo = Substitute.For<IRoomRepository>();
    private readonly IGameNotifier _notifier = Substitute.For<IGameNotifier>();
    private readonly StartGameCommandHandler _handler;

    public StartGameCommandHandlerTests()
    {
        _handler = new StartGameCommandHandler(_repo, _notifier);
    }

    private static GameRoom MakeRoom(int playerCount = 2, string? creatorId = null)
    {
        var players = Enumerable.Range(0, playerCount).Select(i => new Player
        {
            PlayerId = $"player-{i}",
            Name = $"Player{i}",
            Stack = 1000
        }).ToList();

        return new GameRoom
        {
            RoomCode = "ABC123",
            StartingStack = 1000,
            SmallBlind = 10,
            BigBlind = 20,
            MaxPlayers = 9,
            Players = players,
            CurrentState = null,
            CreatorPlayerId = creatorId ?? (players.Count > 0 ? players[0].PlayerId : null),
            CreatedAt = DateTime.UtcNow,
            LastUpdatedAt = DateTime.UtcNow,
        };
    }

    [Fact]
    public async Task Handle_ValidStart_SetsGameStateAndBroadcasts()
    {
        var room = MakeRoom(playerCount: 2);
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new StartGameCommand { RoomCode = "ABC123", PlayerId = "player-0" }, CancellationToken.None);

        result.Success.Should().BeTrue();
        result.GameState.Should().NotBeNull();
        room.CurrentState.Should().NotBeNull();
        room.IsGameStarted.Should().BeTrue();
        await _repo.Received(1).SaveAsync(room, Arg.Any<CancellationToken>());
        await _notifier.Received(1).NotifyGameStarted("ABC123", Arg.Any<GameStateDto>());
    }

    [Fact]
    public async Task Handle_RoomNotFound_ReturnsError()
    {
        _repo.GetByRoomCodeAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns((GameRoom?)null);

        var result = await _handler.Handle(new StartGameCommand { RoomCode = "ZZZZZZ", PlayerId = "x" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("not found");
    }

    [Fact]
    public async Task Handle_NonCreatorTriesToStart_ReturnsError()
    {
        var room = MakeRoom(playerCount: 2);
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new StartGameCommand { RoomCode = "ABC123", PlayerId = "player-1" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("creator");
    }

    [Fact]
    public async Task Handle_NotEnoughPlayers_ReturnsError()
    {
        var room = MakeRoom(playerCount: 1);
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new StartGameCommand { RoomCode = "ABC123", PlayerId = "player-0" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("2 players");
    }

    [Fact]
    public async Task Handle_GameAlreadyStarted_ReturnsError()
    {
        var room = MakeRoom(playerCount: 2);
        room.CurrentState = new GameState();  // already started
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new StartGameCommand { RoomCode = "ABC123", PlayerId = "player-0" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("already started");
    }
}
