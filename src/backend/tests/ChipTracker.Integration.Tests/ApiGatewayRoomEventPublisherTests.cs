using System.Collections.Concurrent;
using System.Text;
using Amazon.ApiGatewayManagementApi;
using Amazon.ApiGatewayManagementApi.Model;
using ChipTracker.Application;
using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using ChipTracker.Infrastructure.Realtime;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace ChipTracker.Integration.Tests;

public class ApiGatewayRoomEventPublisherTests
{
    private class InMemoryConnections : IConnectionRepository
    {
        public ConcurrentDictionary<string, string> Rows { get; } = new();

        public Task AddAsync(string roomCode, string connectionId, string? playerId, CancellationToken ct = default)
        {
            Rows[connectionId] = roomCode;
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<RoomConnection>> ListByRoomAsync(string roomCode, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<RoomConnection>>(Rows.Where(r => r.Value == roomCode)
                .Select(r => new RoomConnection(r.Value, r.Key, null)).ToList());

        public Task RemoveAsync(string roomCode, string connectionId, CancellationToken ct = default)
        {
            Rows.TryRemove(connectionId, out _);
            return Task.CompletedTask;
        }
    }

    private readonly IAmazonApiGatewayManagementApi _api = Substitute.For<IAmazonApiGatewayManagementApi>();
    private readonly InMemoryConnections _connections = new();
    private readonly ApiGatewayRoomEventPublisher _publisher;

    public ApiGatewayRoomEventPublisherTests()
    {
        _publisher = new ApiGatewayRoomEventPublisher(_api, _connections,
            NullLogger<ApiGatewayRoomEventPublisher>.Instance);
    }

    private static RoomEvent Event()
    {
        var room = new GameRoom { RoomCode = "ABC123", Revision = 5 };
        return new RoomEvent(RoomEventTypes.PlayerJoined, "ABC123", 5, "p1", RoomSnapshot.From(room));
    }

    [Fact]
    public async Task FansOutToEveryConnectionInTheRoom_OnlyThatRoom()
    {
        await _connections.AddAsync("ABC123", "c1", null);
        await _connections.AddAsync("ABC123", "c2", null);
        await _connections.AddAsync("OTHER1", "c3", null);
        var posted = new ConcurrentBag<(string Id, string Body)>();
        _api.PostToConnectionAsync(Arg.Any<PostToConnectionRequest>(), Arg.Any<CancellationToken>()).Returns(call =>
        {
            var req = call.Arg<PostToConnectionRequest>();
            posted.Add((req.ConnectionId, Encoding.UTF8.GetString(((MemoryStream)req.Data).ToArray())));
            return Task.FromResult(new PostToConnectionResponse());
        });

        await _publisher.PublishAsync(Event());

        posted.Select(p => p.Id).Should().BeEquivalentTo("c1", "c2");
        posted.Should().OnlyContain(p => p.Body.Contains("\"type\":\"playerJoined\"") && p.Body.Contains("\"revision\":5"));
    }

    [Fact]
    public async Task GoneConnection_IsRemoved_OthersStillReceive()
    {
        await _connections.AddAsync("ABC123", "gone", null);
        await _connections.AddAsync("ABC123", "alive", null);
        _api.PostToConnectionAsync(Arg.Any<PostToConnectionRequest>(), Arg.Any<CancellationToken>()).Returns(call =>
            call.Arg<PostToConnectionRequest>().ConnectionId == "gone"
                ? Task.FromException<PostToConnectionResponse>(new GoneException("gone"))
                : Task.FromResult(new PostToConnectionResponse()));

        await _publisher.PublishAsync(Event());

        _connections.Rows.Keys.Should().BeEquivalentTo("alive");
        await _api.Received(1).PostToConnectionAsync(
            Arg.Is<PostToConnectionRequest>(r => r.ConnectionId == "alive"), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task OtherFailures_AreTolerated_AndRowsKept()
    {
        await _connections.AddAsync("ABC123", "c1", null);
        await _connections.AddAsync("ABC123", "c2", null);
        _api.PostToConnectionAsync(Arg.Any<PostToConnectionRequest>(), Arg.Any<CancellationToken>()).Returns(call =>
            call.Arg<PostToConnectionRequest>().ConnectionId == "c1"
                ? Task.FromException<PostToConnectionResponse>(new InvalidOperationException("throttled"))
                : Task.FromResult(new PostToConnectionResponse()));

        await _publisher.Invoking(p => p.PublishAsync(Event())).Should().NotThrowAsync();

        _connections.Rows.Keys.Should().BeEquivalentTo("c1", "c2");
        await _api.Received(2).PostToConnectionAsync(Arg.Any<PostToConnectionRequest>(), Arg.Any<CancellationToken>());
    }
}
