using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ChipTracker.Application;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.DynamoDb;

namespace ChipTracker.Integration.Tests;

public class RoomConcurrencyApiTests : IAsyncLifetime
{
    private readonly DynamoDbContainer _container = new DynamoDbBuilder().Build();
    private WebApplicationFactory<Program> _factory = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        Environment.SetEnvironmentVariable("AWS_REGION", "us-east-1");
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("DynamoDB:UseLocal", "true");
            builder.UseSetting("DynamoDB:ServiceUrl", _container.GetConnectionString());
            builder.UseSetting("RateLimiting:JoinPerMinute", "1000");
            builder.UseSetting("RateLimiting:ReadPerMinute", "1000");
        });
    }

    public async Task DisposeAsync()
    {
        await _factory.DisposeAsync();
        await _container.DisposeAsync();
    }

    private static async Task<string> CreateRoom(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/rooms", new { startingStack = 1000, smallBlind = 10, bigBlind = 20 });
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        return body.GetProperty("roomCode").GetString()!;
    }

    [Fact]
    public async Task ConcurrentJoins_AllPlayersPersist_AndRevisionAdvancesPerJoin()
    {
        var client = _factory.CreateClient();
        var code = await CreateRoom(client);

        // Retries are capped server-side, so a heavily contended join may legitimately get a 409; clients retry.
        var statuses = await Task.WhenAll(Enumerable.Range(0, 8).Select(async i =>
        {
            for (var attempt = 0; attempt < 20; attempt++)
            {
                var response = await client.PostAsJsonAsync($"/api/rooms/{code}/join", new { name = $"Player{i}" });
                if (response.StatusCode != HttpStatusCode.Conflict)
                    return response.StatusCode;
                await Task.Delay(Random.Shared.Next(10, 60));
            }
            return HttpStatusCode.Conflict;
        }));

        statuses.Should().OnlyContain(s => s == HttpStatusCode.OK);

        var room = await client.GetFromJsonAsync<JsonElement>($"/api/rooms/{code}");
        room.GetProperty("roomInfo").GetProperty("players").GetArrayLength().Should().Be(8);
        room.GetProperty("revision").GetInt64().Should().Be(1 + 8);
    }

    [Fact]
    public async Task ForcedConflict_SurfacesAs409()
    {
        var factory = _factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.AddScoped<IRoomRepository, AlwaysConflictRepository>()));
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/rooms/ABC123/join", new { name = "Alice" });

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("success").GetBoolean().Should().BeFalse();
        body.GetProperty("error").GetString().Should().Be(RoomConcurrencyException.DefaultMessage);
    }

    private class AlwaysConflictRepository : IRoomRepository
    {
        public Task<GameRoom?> GetByRoomCodeAsync(string roomCode, CancellationToken ct = default) =>
            Task.FromResult<GameRoom?>(new GameRoom { RoomCode = roomCode, StartingStack = 1000, Revision = 1 });

        public Task SaveAsync(GameRoom room, CancellationToken ct = default) =>
            throw new RoomConcurrencyException();

        public Task<bool> TryCreateAsync(GameRoom room, CancellationToken ct = default) => Task.FromResult(true);

        public Task<bool> ExistsAsync(string roomCode, CancellationToken ct = default) => Task.FromResult(true);
    }
}
