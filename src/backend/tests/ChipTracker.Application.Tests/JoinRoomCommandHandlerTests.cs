using ChipTracker.Application.Commands;
using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using FluentAssertions;
using NSubstitute;

namespace ChipTracker.Application.Tests;

public class JoinRoomCommandHandlerTests
{
    private readonly IRoomRepository _repo = Substitute.For<IRoomRepository>();
    private readonly IGameNotifier _notifier = Substitute.For<IGameNotifier>();
    private readonly JoinRoomCommandHandler _handler;

    public JoinRoomCommandHandlerTests()
    {
        _handler = new JoinRoomCommandHandler(_repo, _notifier);
    }

    private static GameRoom MakeRoom(int playerCount = 0, bool gameStarted = false) => new()
    {
        RoomCode = "ABC123",
        StartingStack = 1000,
        SmallBlind = 10,
        BigBlind = 20,
        MaxPlayers = 9,
        Players = Enumerable.Range(0, playerCount).Select(i => new Player
        {
            PlayerId = Guid.NewGuid().ToString(),
            Name = $"Player{i}",
            Stack = 1000
        }).ToList(),
        CurrentState = gameStarted ? new GameState() : null,
        CreatedAt = DateTime.UtcNow,
        LastUpdatedAt = DateTime.UtcNow,
    };

    [Fact]
    public async Task Handle_FirstPlayerJoin_IsCreatorAndSaved()
    {
        var room = MakeRoom();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new JoinRoomCommand { RoomCode = "ABC123", PlayerName = "Alice" }, CancellationToken.None);

        result.Success.Should().BeTrue();
        result.IsCreator.Should().BeTrue();
        result.PlayerId.Should().NotBeNullOrEmpty();
        room.CreatorPlayerId.Should().Be(result.PlayerId);
        room.Players.Should().HaveCount(1);
        await _repo.Received(1).SaveAsync(room, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_SecondPlayerJoin_IsNotCreator()
    {
        var room = MakeRoom(playerCount: 1);
        room.CreatorPlayerId = room.Players[0].PlayerId;
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new JoinRoomCommand { RoomCode = "ABC123", PlayerName = "Bob" }, CancellationToken.None);

        result.Success.Should().BeTrue();
        result.IsCreator.Should().BeFalse();
    }

    [Fact]
    public async Task Handle_RoomNotFound_ReturnsError()
    {
        _repo.GetByRoomCodeAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns((GameRoom?)null);

        var result = await _handler.Handle(new JoinRoomCommand { RoomCode = "ZZZZZZ", PlayerName = "Alice" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("not found");
    }

    [Fact]
    public async Task Handle_GameAlreadyStarted_ReturnsError()
    {
        var room = MakeRoom(playerCount: 2, gameStarted: true);
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new JoinRoomCommand { RoomCode = "ABC123", PlayerName = "Charlie" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("already started");
    }

    [Fact]
    public async Task Handle_RoomFull_ReturnsError()
    {
        var room = MakeRoom(playerCount: 9);
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new JoinRoomCommand { RoomCode = "ABC123", PlayerName = "Extra" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("full");
    }

    [Fact]
    public async Task Handle_DuplicateName_ReturnsError()
    {
        var room = MakeRoom(playerCount: 1);
        room.Players[0].Name = "Alice";
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new JoinRoomCommand { RoomCode = "ABC123", PlayerName = "alice" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("already exists");
    }

    [Fact]
    public async Task Handle_EmptyName_ReturnsError()
    {
        var room = MakeRoom();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        var result = await _handler.Handle(new JoinRoomCommand { RoomCode = "ABC123", PlayerName = "   " }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("empty");
    }

    [Fact]
    public async Task Handle_ValidJoin_BroadcastsPlayerJoined()
    {
        var room = MakeRoom();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);

        await _handler.Handle(new JoinRoomCommand { RoomCode = "ABC123", PlayerName = "Alice" }, CancellationToken.None);

        await _notifier.Received(1).NotifyPlayerJoined("ABC123", Arg.Any<PlayerDto>(), 1);
    }
}
