using System.Text.RegularExpressions;
using Amazon.DynamoDBv2;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using ChipTracker.Application.Interfaces;
using ChipTracker.Infrastructure.Persistence;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace ChipTracker.WsConnect;

/// <summary>
/// API Gateway WebSocket <c>$connect</c> handler: validates the room and records the connection.
/// Returning a non-2xx status rejects the upgrade.
/// </summary>
public partial class Function
{
    [GeneratedRegex("^[A-Z0-9]{6}$")]
    private static partial Regex RoomCodePattern();

    private readonly IRoomRepository _rooms;
    private readonly IConnectionRepository _connections;

    public Function()
    {
        var client = new AmazonDynamoDBClient();
        _rooms = new DynamoDbRoomRepository(client,
            Environment.GetEnvironmentVariable("DynamoDB__TableName") ?? "ChipTracker_Rooms");
        _connections = new DynamoDbConnectionRepository(client,
            Environment.GetEnvironmentVariable("DynamoDB__ConnectionsTableName")
            ?? DynamoDbConnectionRepository.DefaultTableName);
    }

    public Function(IRoomRepository rooms, IConnectionRepository connections)
    {
        _rooms = rooms;
        _connections = connections;
    }

    public async Task<APIGatewayProxyResponse> HandleConnectAsync(APIGatewayProxyRequest request,
        ILambdaContext? context = null)
    {
        string? room = null;
        request.QueryStringParameters?.TryGetValue("room", out room);
        if (room is null || !RoomCodePattern().IsMatch(room))
            return Respond(400, "Invalid room code");

        if (!await _rooms.ExistsAsync(room))
            return Respond(404, "Room not found");

        var connectionId = request.RequestContext?.ConnectionId;
        if (string.IsNullOrEmpty(connectionId))
            return Respond(400, "Missing connection id");

        string? playerId = null;
        request.QueryStringParameters?.TryGetValue("playerId", out playerId);

        await _connections.AddAsync(room, connectionId, playerId);
        return Respond(200, "Connected");
    }

    private static APIGatewayProxyResponse Respond(int status, string body) =>
        new() { StatusCode = status, Body = body };
}
