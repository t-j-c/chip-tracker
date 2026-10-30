using ChipTracker.Application.Commands;
using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Engine;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Enums;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace ChipTracker.Application.Tests;

public class RoomEventPublishingTests
{
    private readonly IRoomRepository _repo = Substitute.For<IRoomRepository>();
    private readonly IRoomEventPublisher _publisher = Substitute.For<IRoomEventPublisher>();
    private readonly RoomEventDispatcher _events;

    public RoomEventPublishingTests()
    {
        _events = new RoomEventDispatcher(_publisher, NullLogger<RoomEventDispatcher>.Instance);
    }

    private static GameRoom StartedRoom(int playerCount = 2)
    {
        var players = Enumerable.Range(1, playerCount)
            .Select(i => new Player { PlayerId = $"p{i}", Name = $"Player{i}", Stack = 1000 }).ToList();
        var room = new GameRoom
        {
            RoomCode = "ABC123", StartingStack = 1000, SmallBlind = 10, BigBlind = 20, MaxPlayers = 9,
            Players = players, CreatorPlayerId = "p1", Revision = 7
        };
        room.CurrentState = GameEngine.CreateInitialState(players, 10, 20, dealerIndex: 0);
        return room;
    }

    [Fact]
    public async Task ProcessAction_PublishesOnlyAfterSave_WithRevisionAndActor()
    {
        var room = StartedRoom();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);
        _repo.SaveAsync(room, Arg.Any<CancellationToken>()).Returns(_ =>
        {
            room.Revision = 8;
            return Task.CompletedTask;
        });
        var actor = room.CurrentState!.ActivePlayerTurnId!;
        var handler = new ProcessActionCommandHandler(_repo, _events);

        var result = await handler.Handle(new ProcessActionCommand
        {
            RoomCode = "ABC123", PlayerId = actor, Action = PokerAction.Call
        }, CancellationToken.None);

        result.Success.Should().BeTrue();
        result.Snapshot!.Revision.Should().Be(8);
        Received.InOrder(() =>
        {
            _repo.SaveAsync(room, Arg.Any<CancellationToken>());
            _publisher.PublishAsync(Arg.Is<RoomEvent>(e =>
                e.Type == RoomEventTypes.GameStateUpdated && e.Revision == 8 && e.ActorPlayerId == actor),
                Arg.Any<CancellationToken>());
        });
    }

    [Fact]
    public async Task ProcessAction_InvalidAction_DoesNotPublish()
    {
        var room = StartedRoom();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);
        var handler = new ProcessActionCommandHandler(_repo, _events);

        var result = await handler.Handle(new ProcessActionCommand
            { RoomCode = "ABC123", PlayerId = "nobody", Action = PokerAction.Call }, CancellationToken.None);

        result.Success.Should().BeFalse();
        await _publisher.DidNotReceiveWithAnyArgs().PublishAsync(default!, default);
    }

    [Fact]
    public async Task FailedPublish_DoesNotFailTheCommand()
    {
        var room = StartedRoom();
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);
        _publisher.PublishAsync(Arg.Any<RoomEvent>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromException(new InvalidOperationException("boom")));
        var handler = new ProcessActionCommandHandler(_repo, _events);

        var result = await handler.Handle(new ProcessActionCommand
        {
            RoomCode = "ABC123", PlayerId = room.CurrentState!.ActivePlayerTurnId!, Action = PokerAction.Call
        }, CancellationToken.None);

        result.Success.Should().BeTrue();
        result.Snapshot.Should().NotBeNull();
    }

    [Fact]
    public async Task RequestUndo_PublishesUndoRequested_AndSnapshotCarriesPendingUndo()
    {
        var room = StartedRoom();
        room.StateHistory = [new GameState()];
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);
        var handler = new RequestUndoCommandHandler(_repo, _events);

        var result = await handler.Handle(new RequestUndoCommand { RoomCode = "ABC123", PlayerId = "p1" }, CancellationToken.None);

        result.Success.Should().BeTrue();
        result.Snapshot!.GameState!.PendingUndoRequestBy.Should().Be("p1");
        await _publisher.Received(1).PublishAsync(
            Arg.Is<RoomEvent>(e => e.Type == RoomEventTypes.UndoRequested && e.ActorPlayerId == "p1"),
            Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData(false, "p2", RoomEventTypes.UndoDeclined)]
    [InlineData(true, "p1", RoomEventTypes.UndoCancelled)]
    public async Task ClearUndo_PublishesDeclinedOrCancelled(bool isCancel, string actor, string expectedType)
    {
        var room = StartedRoom();
        room.PendingUndoRequestBy = "p1";
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);
        var handler = new ClearUndoRequestCommandHandler(_repo, _events);

        var result = await handler.Handle(
            new ClearUndoRequestCommand { RoomCode = "ABC123", PlayerId = actor, IsCancel = isCancel }, CancellationToken.None);

        result.Success.Should().BeTrue();
        result.Snapshot!.GameState!.PendingUndoRequestBy.Should().BeNull();
        await _publisher.Received(1).PublishAsync(
            Arg.Is<RoomEvent>(e => e.Type == expectedType && e.ActorPlayerId == actor), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ResolveShowdown_PublishesGameStateUpdated()
    {
        var room = StartedRoom();
        room.CurrentState!.Phase = GamePhase.Showdown;
        room.CurrentState.IsHandActive = false;
        _repo.GetByRoomCodeAsync("ABC123", Arg.Any<CancellationToken>()).Returns(room);
        var handler = new ResolveShowdownCommandHandler(_repo, _events);

        var result = await handler.Handle(
            new ResolveShowdownCommand { RoomCode = "ABC123", WinnerPlayerId = "p1" }, CancellationToken.None);

        result.Success.Should().BeTrue();
        await _publisher.Received(1).PublishAsync(
            Arg.Is<RoomEvent>(e => e.Type == RoomEventTypes.GameStateUpdated), Arg.Any<CancellationToken>());
    }

    [Fact]
    public void MaxSizeSnapshot_SerializesWithinFrameLimit()
    {
        var room = StartedRoom(9);
        room.PendingUndoRequestBy = "p1";
        for (var i = 0; i < 20; i++)
        {
            room.ActivityLog.Add(new ActivityEntry
            {
                Sequence = i, EntryType = ActivityEntryType.PlayerAction, PlayerId = "p1", Action = PokerAction.Raise,
                Amount = 1000, PlayerName = "Player1", StateVersion = i
            });
        }

        var evt = new RoomEvent(RoomEventTypes.GameStateUpdated, "ABC123", 42, "p1", RoomSnapshot.From(room));
        var json = RoomEventSerializer.Serialize(evt);

        System.Text.Encoding.UTF8.GetByteCount(json).Should().BeLessThanOrEqualTo(RoomEventSerializer.MaxFrameBytes);
        json.Should().Contain("\"type\":\"gameStateUpdated\"").And.Contain("\"revision\":42").And.NotContain("\"stale\"");
    }

    [Fact]
    public void OversizedEvent_IsSentAsStaleEnvelope()
    {
        var room = StartedRoom(9);
        room.Players[0].Name = new string('x', 40_000);

        var json = RoomEventSerializer.Serialize(
            new RoomEvent(RoomEventTypes.GameStateUpdated, "ABC123", 3, "p1", RoomSnapshot.From(room)));

        json.Should().Contain("\"stale\":true").And.NotContain("roomInfo");
    }

    [Fact]
    public void RoomSnapshot_InLobby_HasNoGameState()
    {
        var room = new GameRoom { RoomCode = "ABC123", Revision = 2 };

        var snapshot = RoomSnapshot.From(room);

        snapshot.GameState.Should().BeNull();
        snapshot.Revision.Should().Be(2);
    }
}
