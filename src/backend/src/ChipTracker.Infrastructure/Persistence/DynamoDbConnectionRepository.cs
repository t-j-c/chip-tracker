using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using ChipTracker.Application.Interfaces;

namespace ChipTracker.Infrastructure.Persistence;

public class DynamoDbConnectionRepository : IConnectionRepository
{
    public const string DefaultTableName = "ChipTracker_Connections";
    public const string RoomCodeAttribute = "RoomCode";
    public const string ConnectionIdAttribute = "ConnectionId";
    public const string PlayerIdAttribute = "PlayerId";
    public const string ConnectedAtAttribute = "ConnectedAt";
    public const string ExpirationAttribute = "ExpirationTime";

    // API Gateway closes any WebSocket after 2 hours, so a row never needs to outlive that by much.
    public static readonly TimeSpan RowLifetime = TimeSpan.FromMinutes(135);

    private readonly IAmazonDynamoDB _client;
    private readonly string _tableName;

    public DynamoDbConnectionRepository(IAmazonDynamoDB client, string tableName = DefaultTableName)
    {
        _client = client;
        _tableName = tableName;
    }

    public async Task AddAsync(string roomCode, string connectionId, string? playerId,
        CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var item = new Dictionary<string, AttributeValue>
        {
            [RoomCodeAttribute] = new() { S = roomCode },
            [ConnectionIdAttribute] = new() { S = connectionId },
            [ConnectedAtAttribute] = new() { S = now.ToString("O") },
            [ExpirationAttribute] = new() { N = now.Add(RowLifetime).ToUnixTimeSeconds().ToString() }
        };
        if (!string.IsNullOrEmpty(playerId))
            item[PlayerIdAttribute] = new AttributeValue { S = playerId };

        await _client.PutItemAsync(new PutItemRequest { TableName = _tableName, Item = item }, cancellationToken);
    }

    public async Task<IReadOnlyList<RoomConnection>> ListByRoomAsync(string roomCode,
        CancellationToken cancellationToken = default)
    {
        var connections = new List<RoomConnection>();
        Dictionary<string, AttributeValue>? startKey = null;
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        do
        {
            var response = await _client.QueryAsync(new QueryRequest
            {
                TableName = _tableName,
                KeyConditionExpression = "#room = :room",
                ExpressionAttributeNames = new Dictionary<string, string> { ["#room"] = RoomCodeAttribute },
                ExpressionAttributeValues = new Dictionary<string, AttributeValue>
                    { [":room"] = new() { S = roomCode } },
                ConsistentRead = true,
                ExclusiveStartKey = startKey
            }, cancellationToken);

            foreach (var item in response.Items ?? [])
            {
                // TTL deletion is lazy, so ignore rows that are already expired.
                if (item.TryGetValue(ExpirationAttribute, out var exp) && long.TryParse(exp.N, out var expiresAt)
                    && expiresAt <= now)
                    continue;

                connections.Add(new RoomConnection(
                    item[RoomCodeAttribute].S,
                    item[ConnectionIdAttribute].S,
                    item.TryGetValue(PlayerIdAttribute, out var player) ? player.S : null));
            }

            startKey = response.LastEvaluatedKey is { Count: > 0 } ? response.LastEvaluatedKey : null;
        } while (startKey != null);

        return connections;
    }

    public async Task RemoveAsync(string roomCode, string connectionId, CancellationToken cancellationToken = default)
    {
        await _client.DeleteItemAsync(new DeleteItemRequest
        {
            TableName = _tableName,
            Key = new Dictionary<string, AttributeValue>
            {
                [RoomCodeAttribute] = new() { S = roomCode },
                [ConnectionIdAttribute] = new() { S = connectionId }
            }
        }, cancellationToken);
    }
}
