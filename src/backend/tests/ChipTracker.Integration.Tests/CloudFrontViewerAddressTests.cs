using System.Net;
using System.Net.Http.Json;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using ChipTracker.Presentation.RateLimiting;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace ChipTracker.Integration.Tests;

public class CloudFrontViewerAddressTests : IClassFixture<CloudFrontViewerAddressTests.Factory>
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
            builder.UseSetting("RateLimiting:ClientIpSource", "CloudFrontViewerAddress");
            builder.UseSetting("RateLimiting:CreateRoomPerMinute", "2");
            builder.ConfigureServices(services => services.AddScoped<IRoomRepository, FakeRepo>());
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
    public CloudFrontViewerAddressTests(Factory factory) => _factory = factory;

    private static Task<HttpResponseMessage> Create(HttpClient client, string? viewerAddress)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/rooms")
        {
            Content = JsonContent.Create(new { startingStack = 1000, smallBlind = 10, bigBlind = 20 })
        };
        if (viewerAddress != null)
            req.Headers.Add(CloudFrontViewerAddress.HeaderName, viewerAddress);
        return client.SendAsync(req);
    }

    [Theory]
    [InlineData("203.0.113.9:443", "203.0.113.9")]
    [InlineData("[2001:db8::1]:443", "2001:db8::1")]
    [InlineData("2001:db8::1:443", "2001:db8::1:443")]
    [InlineData("2001:db8::1", "2001:db8::1")]
    public void Parse_ExtractsIp(string header, string expected) =>
        CloudFrontViewerAddress.Parse(header)!.ToString().Should().Be(expected);

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("garbage")]
    [InlineData("not-an-ip:443")]
    public void Parse_ReturnsNullForMissingOrGarbage(string? header) =>
        CloudFrontViewerAddress.Parse(header).Should().BeNull();

    [Fact]
    public async Task DifferentViewerIps_UseDifferentPartitions()
    {
        var client = _factory.CreateClient();
        for (var i = 0; i < 2; i++)
            (await Create(client, "198.51.100.1:1000")).StatusCode.Should().Be(HttpStatusCode.OK);

        (await Create(client, "198.51.100.1:2000")).StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
        (await Create(client, "198.51.100.2:1000")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ApiHealth_ReturnsHealthy()
    {
        var response = await _factory.CreateClient().GetAsync("/api/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await response.Content.ReadAsStringAsync()).Should().Be("\"healthy\"");
    }
}
