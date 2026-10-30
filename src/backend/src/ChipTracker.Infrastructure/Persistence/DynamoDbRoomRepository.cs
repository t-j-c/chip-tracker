using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.DocumentModel;
using Amazon.DynamoDBv2.Model;
using ChipTracker.Application;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace ChipTracker.Infrastructure.Persistence;

public class DynamoDbRoomRepository : IRoomRepository
{
    private readonly IAmazonDynamoDB _dynamoDbClient;
    private readonly string _tableName;
    private readonly int _roomTtlDays;
    private readonly ILogger _logger;
    private ITable? _table;

    public DynamoDbRoomRepository(IAmazonDynamoDB dynamoDbClient, string tableName = "ChipTracker_Rooms",
        int roomTtlDays = 1, ILogger? logger = null, ITable? table = null)
    {
        _dynamoDbClient = dynamoDbClient;
        _tableName = tableName;
        _roomTtlDays = roomTtlDays;
        _logger = logger ?? NullLogger.Instance;
        _table = table;
    }

    /// <summary>Builds the table handle from the known key schema, avoiding a DescribeTable round trip.</summary>
    public static ITable BuildTable(IAmazonDynamoDB client, string tableName) =>
        new TableBuilder(client, tableName).AddHashKey("RoomCode", DynamoDBEntryType.String).Build();

    private ITable GetTable()
    {
        _table ??= BuildTable(_dynamoDbClient, _tableName);
        return _table;
    }

    public async Task<GameRoom?> GetByRoomCodeAsync(string roomCode, CancellationToken cancellationToken = default)
    {
        var document = await GetTable().GetItemAsync(roomCode, new GetItemOperationConfig { ConsistentRead = true },
            cancellationToken);
        if (document == null)
            return null;

        // DynamoDB deletes expired items lazily (and DynamoDB Local never does).
        if (document.TryGetValue(RoomDocumentSerializer.ExpirationAttribute, out var exp)
            && exp.AsLong() <= DateTimeOffset.UtcNow.ToUnixTimeSeconds())
            return null;

        return RoomDocumentSerializer.Deserialize(document);
    }

    public async Task SaveAsync(GameRoom room, CancellationToken cancellationToken = default)
    {
        var expected = room.Revision;
        room.Revision = expected + 1;
        var config = new PutItemOperationConfig
        {
            ConditionalExpression = new Expression
            {
                ExpressionStatement = "attribute_not_exists(#rev) OR #rev = :expected",
                ExpressionAttributeNames = { ["#rev"] = RoomDocumentSerializer.RevisionAttribute },
                ExpressionAttributeValues = { [":expected"] = expected }
            }
        };

        try
        {
            await GetTable().PutItemAsync(BuildDocument(room), config, cancellationToken);
        }
        catch (ConditionalCheckFailedException ex)
        {
            room.Revision = expected;
            throw new RoomConcurrencyException(RoomConcurrencyException.DefaultMessage, ex);
        }
        catch
        {
            room.Revision = expected;
            throw;
        }
    }

    public async Task<bool> TryCreateAsync(GameRoom room, CancellationToken cancellationToken = default)
    {
        room.Revision = 1;
        var config = new PutItemOperationConfig
        {
            ConditionalExpression = new Expression
            {
                ExpressionStatement = "attribute_not_exists(RoomCode) OR #exp < :now",
                ExpressionAttributeNames = { ["#exp"] = RoomDocumentSerializer.ExpirationAttribute },
                ExpressionAttributeValues = { [":now"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds() }
            }
        };

        try
        {
            await GetTable().PutItemAsync(BuildDocument(room), config, cancellationToken);
            return true;
        }
        catch (ConditionalCheckFailedException)
        {
            return false;
        }
    }

    public async Task<bool> ExistsAsync(string roomCode, CancellationToken cancellationToken = default)
    {
        var response = await _dynamoDbClient.GetItemAsync(new GetItemRequest
        {
            TableName = _tableName,
            Key = new Dictionary<string, AttributeValue> { ["RoomCode"] = new() { S = roomCode } },
            ConsistentRead = true,
            ProjectionExpression = "RoomCode, #exp",
            ExpressionAttributeNames = new Dictionary<string, string> { ["#exp"] = RoomDocumentSerializer.ExpirationAttribute }
        }, cancellationToken);

        if (!response.IsItemSet)
            return false;

        return !response.Item.TryGetValue(RoomDocumentSerializer.ExpirationAttribute, out var exp)
            || !long.TryParse(exp.N, out var expiresAt)
            || expiresAt > DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    }

    private Document BuildDocument(GameRoom room)
    {
        var expiresAt = DateTime.UtcNow.AddDays(_roomTtlDays);
        var document = RoomDocumentSerializer.Serialize(room, expiresAt, out var trimmed);
        if (trimmed)
            _logger.LogWarning("Room {RoomCode} exceeded the item size budget; history/activity was trimmed", room.RoomCode);
        return document;
    }
}
