using System.Net;
using System.Net.Http.Json;
using System.Reflection;
using System.Security.Claims;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using ChipTracker.Presentation.RateLimiting;
using FluentAssertions;
using Microsoft.AspNetCore.Connections;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

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

    private class TestHub : Hub { }

    private class TestContext : HubCallerContext
    {
        public override string ConnectionId => "c1";
        public override string? UserIdentifier => null;
        public override ClaimsPrincipal? User => null;
        public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();
        public override IFeatureCollection Features { get; } = new FeatureCollection();
        public override CancellationToken ConnectionAborted => CancellationToken.None;
        public override void Abort() { }
    }

    [Fact]
    public async Task HubFilter_AllowsBurstThenThrowsHubException()
    {
        var filter = new HubRateLimitFilter(Options.Create(new RateLimitOptions { HubInvocationBurst = 3, HubInvocationsPerSecond = 1 }));
        var ctx = new TestContext();
        var sp = new ServiceCollection().BuildServiceProvider();
        var hub = new TestHub();
        await filter.OnConnectedAsync(new HubLifetimeContext(ctx, sp, hub), _ => Task.CompletedTask);

        var method = typeof(TestHub).GetMethod(nameof(object.ToString))!;
        var invocation = new HubInvocationContext(ctx, sp, hub, method, []);
        ValueTask<object?> Next(HubInvocationContext _) => new((object?)null);

        for (var i = 0; i < 3; i++)
            await filter.InvokeMethodAsync(invocation, Next);

        var act = async () => await filter.InvokeMethodAsync(invocation, Next);
        await act.Should().ThrowAsync<HubException>();
    }
}
