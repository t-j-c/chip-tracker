using Microsoft.Extensions.Logging.Abstractions;
using ChipTracker.Application.Commands;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Engine;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Enums;
using FluentAssertions;
using NSubstitute;

namespace ChipTracker.Application.Tests;

public class SeatingAndRestartCommandHandlerTests
{
    private readonly IRoomRepository _repo = Substitute.For<IRoomRepository>();
    private readonly IRoomEventPublisher _publisher = Substitute.For<IRoomEventPublisher>();
    private readonly ReorderSeatsCommandHandler _reorder;
    private readonly RestartHandCommandHandler _restart;

    public SeatingAndRestartCommandHandlerTests()
    {
        var events = new RoomEventDispatcher(_publisher, NullLogger<RoomEventDispatcher>.Instance);
        _reorder = new ReorderSeatsCommandHandler(_repo, events);
        _restart = new RestartHandCommandHandler(_repo, events);
    }

    private GameRoom ArrangeRoom(bool started)
    {
        var room = new GameRoom
        {
            RoomCode = "ABC123",
            StartingStack = 1000,
            SmallBlind = 10,
            BigBlind = 20,
            CreatorPlayerId = "p1",
            Players =
            [
                new() { PlayerId = "p1", Name = "Alice", Stack = 1000 },
                new() { PlayerId = "p2", Name = "Bob", Stack = 1000 },
                new() { PlayerId = "p3", Name = "Cara", Stack = 1000 }
            ]
        };
        if (started)
        {
            room.CurrentState = GameEngine.CreateInitialState(room.Players, 10, 20, dealerIndex: 0);
            room.PushState();
        }

        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);
        return room;
    }

    private static ReorderSeatsCommand Reorder(string by, params string[] order) =>
        new() { RoomCode = "ABC123", PlayerId = by, OrderedPlayerIds = order.ToList() };

    [Fact]
    public async Task Reorder_ByCreatorInLobby_ReordersPlayersAndBroadcasts()
    {
        var room = ArrangeRoom(started: false);

        var result = await _reorder.Handle(Reorder("p1", "p3", "p1", "p2"), CancellationToken.None);

        result.Success.Should().BeTrue();
        result.Snapshot!.RoomInfo.Players.Select(p => p.PlayerId).Should().Equal("p3", "p1", "p2");
        await _repo.Received(1).SaveAsync(room, Arg.Any<CancellationToken>());
        await _publisher.Received(1).PublishAsync(Arg.Is<RoomEvent>(e => e.Type == RoomEventTypes.SeatsReordered),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Reorder_MidHand_ReturnsPendingOrderInSnapshot()
    {
        ArrangeRoom(started: true);

        var result = await _reorder.Handle(Reorder("p1", "p1", "p3", "p2"), CancellationToken.None);

        result.Success.Should().BeTrue();
        result.Snapshot!.GameState!.PendingSeatOrder.Should().Equal("p1", "p3", "p2");
        result.Snapshot.GameState.Players.Select(p => p.PlayerId).Should().Equal("p1", "p2", "p3");
    }

    [Fact]
    public async Task Reorder_ByNonCreator_Rejected()
    {
        ArrangeRoom(started: false);

        var result = await _reorder.Handle(Reorder("p2", "p3", "p1", "p2"), CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("creator");
        await _repo.DidNotReceive().SaveAsync(Arg.Any<GameRoom>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Reorder_NotEveryPlayerExactlyOnce_Rejected()
    {
        ArrangeRoom(started: false);

        var result = await _reorder.Handle(Reorder("p1", "p1", "p1", "p2"), CancellationToken.None);

        result.Success.Should().BeFalse();
        await _repo.DidNotReceive().SaveAsync(Arg.Any<GameRoom>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Restart_ByCreator_RedealsWithoutUndoHistoryAndBroadcasts()
    {
        var room = ArrangeRoom(started: true);
        room.PushState(GameEngine.ValidateAction(room.CurrentState!,
            new ActionRequest { PlayerId = "p1", Action = PokerAction.Raise, Amount = 200 }).Value!);

        var result = await _restart.Handle(new RestartHandCommand { RoomCode = "ABC123", PlayerId = "p1" }, CancellationToken.None);

        result.Success.Should().BeTrue();
        room.CurrentState!.Pot.Should().Be(30, "bets returned and blinds re-posted");
        room.StateHistory.Should().BeEmpty("a restart can't be undone");
        await _repo.Received(1).SaveAsync(room, Arg.Any<CancellationToken>());
        await _publisher.Received(1).PublishAsync(Arg.Is<RoomEvent>(e => e.Type == RoomEventTypes.HandRestarted),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Restart_WhileWaitingOnRebuyDecision_RejectedAndUndoHistoryKept()
    {
        var room = ArrangeRoom(started: true);
        var waiting = room.CurrentState!.Clone();
        waiting.Players[0].Stack = 0;
        waiting.Players[0].IsAwaitingRebuy = true;
        waiting.IsHandActive = false;
        waiting.ActivePlayerTurnId = null;
        room.PushState(waiting);
        room.PendingUndoRequestBy = "p2";

        var result = await _restart.Handle(new RestartHandCommand { RoomCode = "ABC123", PlayerId = "p1" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        room.StateHistory.Should().NotBeEmpty();
        room.PendingUndoRequestBy.Should().Be("p2");
        await _repo.DidNotReceive().SaveAsync(Arg.Any<GameRoom>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Restart_ByNonCreator_Rejected()
    {
        ArrangeRoom(started: true);

        var result = await _restart.Handle(new RestartHandCommand { RoomCode = "ABC123", PlayerId = "p2" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("creator");
        await _repo.DidNotReceive().SaveAsync(Arg.Any<GameRoom>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Restart_BeforeGameStarted_Rejected()
    {
        ArrangeRoom(started: false);

        var result = await _restart.Handle(new RestartHandCommand { RoomCode = "ABC123", PlayerId = "p1" }, CancellationToken.None);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("not started");
    }
}
