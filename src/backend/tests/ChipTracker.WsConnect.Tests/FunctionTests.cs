using Amazon.Lambda.APIGatewayEvents;
using ChipTracker.Application.Interfaces;
using ChipTracker.WsConnect;
using FluentAssertions;
using NSubstitute;

namespace ChipTracker.WsConnect.Tests;

public class FunctionTests
{
    private readonly IRoomRepository _rooms = Substitute.For<IRoomRepository>();
    private readonly IConnectionRepository _connections = Substitute.For<IConnectionRepository>();
    private readonly Function _function;

    public FunctionTests()
    {
        _function = new Function(_rooms, _connections);
    }

    private static APIGatewayProxyRequest Request(string? room, string? playerId = null, string connectionId = "conn-1")
    {
        var query = new Dictionary<string, string>();
        if (room != null) query["room"] = room;
        if (playerId != null) query["playerId"] = playerId;
        return new APIGatewayProxyRequest
        {
            QueryStringParameters = query.Count == 0 ? null : query,
            RequestContext = new APIGatewayProxyRequest.ProxyRequestContext { ConnectionId = connectionId }
        };
    }

    [Fact]
    public async Task ValidRoom_Returns200_AndWritesRow()
    {
        _rooms.ExistsAsync("ABC123", Arg.Any<CancellationToken>()).Returns(true);

        var response = await _function.HandleConnectAsync(Request("ABC123", "p1"));

        response.StatusCode.Should().Be(200);
        await _connections.Received(1).AddAsync("ABC123", "conn-1", "p1", Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("abc123")]
    [InlineData("ABC12")]
    [InlineData("ABC1234")]
    [InlineData("ABC-23")]
    public async Task MissingOrMalformedRoom_Returns400_AndWritesNothing(string? room)
    {
        var response = await _function.HandleConnectAsync(Request(room));

        response.StatusCode.Should().Be(400);
        await _connections.DidNotReceiveWithAnyArgs().AddAsync(default!, default!, default, default);
    }

    [Fact]
    public async Task UnknownRoom_Returns404_AndWritesNothing()
    {
        _rooms.ExistsAsync("ZZZZZZ", Arg.Any<CancellationToken>()).Returns(false);

        var response = await _function.HandleConnectAsync(Request("ZZZZZZ"));

        response.StatusCode.Should().Be(404);
        await _connections.DidNotReceiveWithAnyArgs().AddAsync(default!, default!, default, default);
    }
}
