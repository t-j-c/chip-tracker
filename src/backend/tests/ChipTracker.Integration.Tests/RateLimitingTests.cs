using System.Net;
using System.Net.Http.Json;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using ChipTracker.Presentation.RateLimiting;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace ChipTracker.Integration.Tests;

public class RateLimitingTests : IClassFixture<RateLimitingTests.Factory>
{
    public class Factory : WebApplicationFactory<Program>
    {
        public Factory()
        {
            Environment.SetEnvironmentVariable("AWS_REGION", "us-east-1");
        }

        protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
        {
            builder.UseSetting("DynamoDB:UseLocal", "false");
            builder.UseSetting("RateLimiting:CreateRoomPerMinute", "3");
            builder.UseSetting("RateLimiting:ReadPerMinute", "2");
            builder.UseSetting("RateLimiting:CommandBurst", "3");
            builder.UseSetting("RateLimiting:CommandsPerSecond", "1");
            builder.ConfigureServices(services =>
            {
                services.AddScoped<IRoomRepository, FakeRepo>();
            });
        }
    }

    private class FakeRepo : IRoomRepository
    {
        public Task<GameRoom?> GetByRoomCodeAsync(string roomCode, CancellationToken ct = default) => Task.FromResult<GameRoom?>(null);
        public Task SaveAsync(GameRoom room, CancellationToken ct = default) => Task.CompletedTask;
        public Task<bool> TryCreateAsync(GameRoom room, CancellationToken ct = default) => Task.FromResult(true);
        public Task<bool> ExistsAsync(string roomCode, CancellationToken ct = default) => Task.FromResult(false);
    }

    private readonly Factory _factory;
    public RateLimitingTests(Factory factory) => _factory = factory;

    private Task<HttpResponseMessage> Create(HttpClient client, string ip)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/rooms")
        {
            Content = JsonContent.Create(new { startingStack = 1000, smallBlind = 10, bigBlind = 20 })
        };
        req.Headers.Add("X-Forwarded-For", ip);
        return client.SendAsync(req);
    }

    [Fact]
    public async Task CreateRoom_Returns429AfterLimit_WithRetryAfterAndJsonBody()
    {
        var client = _factory.CreateClient();
        for (var i = 0; i < 3; i++)
            (await Create(client, "10.0.0.1")).StatusCode.Should().Be(HttpStatusCode.OK);

        var limited = await Create(client, "10.0.0.1");

        limited.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
        limited.Headers.Contains("Retry-After").Should().BeTrue();
        (await limited.Content.ReadAsStringAsync()).Should().Contain("\"success\":false");
    }

    [Fact]
    public async Task Limits_AreTrackedPerForwardedIp()
    {
        var client = _factory.CreateClient();
        for (var i = 0; i < 4; i++)
            await Create(client, "10.0.1.1");

        (await Create(client, "10.0.1.2")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Health_IsNeverLimited()
    {
        var client = _factory.CreateClient();
        for (var i = 0; i < 20; i++)
            (await client.GetAsync("/health")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Commands_AllowBurstThen429()
    {
        var client = _factory.CreateClient();

        async Task<HttpStatusCode> Act()
        {
            var req = new HttpRequestMessage(HttpMethod.Post, "/api/rooms/ABC123/rebuy")
            {
                Content = JsonContent.Create(new { playerId = "p1" })
            };
            req.Headers.Add("X-Forwarded-For", "10.0.2.1");
            return (await client.SendAsync(req)).StatusCode;
        }

        for (var i = 0; i < 3; i++)
            (await Act()).Should().Be(HttpStatusCode.NotFound);

        (await Act()).Should().Be(HttpStatusCode.TooManyRequests);
    }
}