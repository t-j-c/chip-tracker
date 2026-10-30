using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using ChipTracker.Application;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace ChipTracker.Integration.Tests;

public class RealtimeEndpointsTests : IClassFixture<RealtimeEndpointsTests.Factory>
{
    public class InMemoryRoomRepository : IRoomRepository
    {
        private static readonly ConcurrentDictionary<string, GameRoom> Rooms = new();
        public static bool AlwaysConflict { get; set; }

        public Task<GameRoom?> GetByRoomCodeAsync(string roomCode, CancellationToken ct = default) =>
            Task.FromResult(Rooms.TryGetValue(roomCode, out var room) ? Clone(room) : null);

        public Task SaveAsync(GameRoom room, CancellationToken ct = default)
        {
            if (AlwaysConflict)
                throw new RoomConcurrencyException();
            room.Revision++;
            Rooms[room.RoomCode] = Clone(room);
            return Task.CompletedTask;
        }

        public Task<bool> TryCreateAsync(GameRoom room, CancellationToken ct = default)
        {
            room.Revision = 1;
            return Task.FromResult(Rooms.TryAdd(room.RoomCode, Clone(room)));
        }

        public Task<bool> ExistsAsync(string roomCode, CancellationToken ct = default) =>
            Task.FromResult(Rooms.ContainsKey(roomCode));

        // Round-trip through JSON so each request sees its own copy, as it would from a database.
        private static GameRoom Clone(GameRoom room) =>
            System.Text.Json.JsonSerializer.Deserialize<GameRoom>(System.Text.Json.JsonSerializer.Serialize(room))!;
    }

    public class Factory : WebApplicationFactory<Program>
    {
        public Factory()
        {
            Environment.SetEnvironmentVariable("AWS_REGION", "us-east-1");
        }

        protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
        {
            builder.UseSetting("DynamoDB:UseLocal", "false");
            builder.UseSetting("RateLimiting:CreateRoomPerMinute", "1000");
            builder.UseSetting("RateLimiting:JoinPerMinute", "1000");
            builder.UseSetting("RateLimiting:ReadPerMinute", "1000");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IRoomRepository>();
                services.AddScoped<IRoomRepository, InMemoryRoomRepository>();
            });
        }
    }

    private readonly Factory _factory;
    private readonly HttpClient _client;

    public RealtimeEndpointsTests(Factory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
        InMemoryRoomRepository.AlwaysConflict = false;
    }

    private async Task<(string Code, string P1, string P2)> StartedRoom()
    {
        var create = await _client.PostAsJsonAsync("/api/rooms", new { startingStack = 1000, smallBlind = 10, bigBlind = 20 });
        var code = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("roomCode").GetString()!;
        var p1 = (await (await _client.PostAsJsonAsync($"/api/rooms/{code}/join", new { name = "Alice" }))
            .Content.ReadFromJsonAsync<JsonElement>()).GetProperty("playerId").GetString()!;
        var p2 = (await (await _client.PostAsJsonAsync($"/api/rooms/{code}/join", new { name = "Bob" }))
            .Content.ReadFromJsonAsync<JsonElement>()).GetProperty("playerId").GetString()!;
        (await _client.PostAsJsonAsync($"/api/rooms/{code}/start", new { playerId = p1 })).EnsureSuccessStatusCode();
        return (code, p1, p2);
    }

    private async Task<JsonElement> Get(string code) =>
        await _client.GetFromJsonAsync<JsonElement>($"/api/rooms/{code}");

    private static async Task<JsonElement> Receive(WebSocket socket)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var buffer = new byte[64 * 1024];
        var result = await socket.ReceiveAsync(buffer, cts.Token);
        return JsonDocument.Parse(Encoding.UTF8.GetString(buffer, 0, result.Count)).RootElement.Clone();
    }

    [Fact]
    public async Task Action_Returns200WithSnapshot_AndPushesNextRevisionOverWebSocket()
    {
        var (code, _, _) = await StartedRoom();
        var before = await Get(code);
        var revision = before.GetProperty("revision").GetInt64();
        var active = before.GetProperty("gameState").GetProperty("activePlayerTurnId").GetString()!;

        var wsClient = _factory.Server.CreateWebSocketClient();
        using var socket = await wsClient.ConnectAsync(new Uri($"ws://localhost/ws?room={code}&playerId={active}"), CancellationToken.None);

        var response = await _client.PostAsJsonAsync($"/api/rooms/{code}/actions", new { playerId = active, action = "Call" });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("revision").GetInt64().Should().Be(revision + 1);
        body.GetProperty("gameState").ValueKind.Should().Be(JsonValueKind.Object);

        var evt = await Receive(socket);
        evt.GetProperty("type").GetString().Should().Be("gameStateUpdated");
        evt.GetProperty("revision").GetInt64().Should().Be(revision + 1);
        evt.GetProperty("actorPlayerId").GetString().Should().Be(active);
        evt.GetProperty("roomCode").GetString().Should().Be(code);
    }

    [Fact]
    public async Task UndoRequest_PushesUndoRequested_WithPendingUndoInSnapshot()
    {
        var (code, p1, _) = await StartedRoom();
        var active = (await Get(code)).GetProperty("gameState").GetProperty("activePlayerTurnId").GetString()!;
        (await _client.PostAsJsonAsync($"/api/rooms/{code}/actions", new { playerId = active, action = "Call" })).EnsureSuccessStatusCode();

        using var socket = await _factory.Server.CreateWebSocketClient()
            .ConnectAsync(new Uri($"ws://localhost/ws?room={code}"), CancellationToken.None);
        var response = await _client.PostAsJsonAsync($"/api/rooms/{code}/undo/request", new { playerId = p1 });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var evt = await Receive(socket);
        evt.GetProperty("type").GetString().Should().Be("undoRequested");
        evt.GetProperty("gameState").GetProperty("pendingUndoRequestBy").GetString().Should().Be(p1);
    }

    [Fact]
    public async Task BadRoom_RejectsUpgrade()
    {
        var wsClient = _factory.Server.CreateWebSocketClient();

        var malformed = async () => await wsClient.ConnectAsync(new Uri("ws://localhost/ws?room=bad"), CancellationToken.None);
        var unknown = async () => await wsClient.ConnectAsync(new Uri("ws://localhost/ws?room=ZZZZZZ"), CancellationToken.None);

        await malformed.Should().ThrowAsync<Exception>();
        await unknown.Should().ThrowAsync<Exception>();
    }

    [Fact]
    public async Task Commands_MapStatusCodes()
    {
        var (code, p1, _) = await StartedRoom();

        (await _client.PostAsJsonAsync($"/api/rooms/{code}/actions", new { playerId = p1, action = "Dance" }))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await _client.PostAsJsonAsync($"/api/rooms/{code}/undo/approve", new { playerId = p1 }))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await _client.PostAsJsonAsync("/api/rooms/ZZZZZZ/rebuy", new { playerId = p1 }))
            .StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await _client.PostAsJsonAsync($"/api/rooms/{code}/showdown", new { winnerPlayerId = p1 }))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Command_ConcurrencyExhausted_Returns409()
    {
        var (code, p1, _) = await StartedRoom();
        var active = (await Get(code)).GetProperty("gameState").GetProperty("activePlayerTurnId").GetString()!;
        (await _client.PostAsJsonAsync($"/api/rooms/{code}/actions", new { playerId = active, action = "Call" })).EnsureSuccessStatusCode();
        InMemoryRoomRepository.AlwaysConflict = true;
        try
        {
            var response = await _client.PostAsJsonAsync($"/api/rooms/{code}/undo/request", new { playerId = p1 });
            response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        }
        finally
        {
            InMemoryRoomRepository.AlwaysConflict = false;
        }
    }

    [Fact]
    public async Task Health_Api_ReturnsOk()
    {
        (await _client.GetAsync("/api/health")).StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
