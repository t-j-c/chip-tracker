using ChipTracker.Application.Commands;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using FluentAssertions;
using NSubstitute;

namespace ChipTracker.Application.Tests;

public class CreateRoomCommandHandlerTests
{
    private readonly IRoomRepository _repo = Substitute.For<IRoomRepository>();
    private readonly CreateRoomCommandHandler _handler;

    public CreateRoomCommandHandlerTests()
    {
        _repo.TryCreateAsync(Arg.Any<GameRoom>(), Arg.Any<CancellationToken>()).Returns(true);
        _handler = new CreateRoomCommandHandler(_repo);
    }

    [Fact]
    public async Task Handle_CodeCollision_RetriesWithNewCode()
    {
        var codes = new List<string>();
        _repo.TryCreateAsync(Arg.Do<GameRoom>(r => codes.Add(r.RoomCode)), Arg.Any<CancellationToken>())
             .Returns(false, true);

        var result = await _handler.Handle(new CreateRoomCommand { StartingStack = 1000, SmallBlind = 10, BigBlind = 20 }, CancellationToken.None);

        result.Success.Should().BeTrue();
        codes.Should().HaveCount(2);
        result.RoomCode.Should().Be(codes[1]);
    }

    [Fact]
    public async Task Handle_CodeAlwaysCollides_ReturnsError()
    {
        _repo.TryCreateAsync(Arg.Any<GameRoom>(), Arg.Any<CancellationToken>()).Returns(false);

        var result = await _handler.Handle(new CreateRoomCommand { StartingStack = 1000, SmallBlind = 10, BigBlind = 20 }, CancellationToken.None);

        result.Success.Should().BeFalse();
        await _repo.Received(5).TryCreateAsync(Arg.Any<GameRoom>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_ValidCommand_CreatesEmptyRoom()
    {
        var command = new CreateRoomCommand { StartingStack = 1000, SmallBlind = 10, BigBlind = 20 };
        var result = await _handler.Handle(command, CancellationToken.None);

        result.Success.Should().BeTrue();
        result.RoomCode.Should().MatchRegex("^[A-Z0-9]{6}$");
        result.Error.Should().BeNull();
    }

    [Fact]
    public async Task Handle_ValidCommand_RoomHasNoPlayersAndNoGameState()
    {
        GameRoom? capturedRoom = null;
        _repo.TryCreateAsync(Arg.Do<GameRoom>(r => capturedRoom = r), Arg.Any<CancellationToken>())
             .Returns(true);

        var command = new CreateRoomCommand { StartingStack = 500, SmallBlind = 5, BigBlind = 10 };
        await _handler.Handle(command, CancellationToken.None);

        capturedRoom.Should().NotBeNull();
        capturedRoom!.Players.Should().BeEmpty();
        capturedRoom.CurrentState.Should().BeNull();
        capturedRoom.StartingStack.Should().Be(500);
        capturedRoom.SmallBlind.Should().Be(5);
        capturedRoom.BigBlind.Should().Be(10);
        capturedRoom.MaxPlayers.Should().Be(9);
    }

    [Fact]
    public async Task Handle_InvalidStartingStack_ReturnsError()
    {
        var command = new CreateRoomCommand { StartingStack = 0, SmallBlind = 10, BigBlind = 20 };
        var result = await _handler.Handle(command, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("Starting stack");
    }

    [Theory]
    [InlineData(10, 15)]  // BB ≠ 2×SB
    [InlineData(0, 20)]   // SB = 0
    [InlineData(10, 0)]   // BB = 0
    public async Task Handle_InvalidBlinds_ReturnsError(int sb, int bb)
    {
        var command = new CreateRoomCommand { StartingStack = 1000, SmallBlind = sb, BigBlind = bb };
        var result = await _handler.Handle(command, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("BigBlind");
    }
}
