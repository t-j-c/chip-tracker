using System.Text.Json;
using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.DocumentModel;
using ChipTracker.Application.Interfaces;
using ChipTracker.Domain.Entities;

namespace ChipTracker.Infrastructure.Persistence;

public class DynamoDbRoomRepository : IRoomRepository
{
    private readonly IAmazonDynamoDB _dynamoDbClient;
    private readonly string _tableName;
    private Table? _table;

    public DynamoDbRoomRepository(IAmazonDynamoDB dynamoDbClient, string tableName = "ChipTracker_Rooms")
    {
        _dynamoDbClient = dynamoDbClient;
        _tableName = tableName;
    }

    private async Task<Table> GetTableAsync()
    {
        if (_table == null)
        {
            _table = Table.LoadTable(_dynamoDbClient, _tableName);
        }
        return _table;
    }

    public async Task<GameRoom?> GetByRoomCodeAsync(string roomCode, CancellationToken cancellationToken = default)
    {
        var table = await GetTableAsync();
        var document = await table.GetItemAsync(roomCode);
        
        if (document == null)
            return null;

        return DeserializeGameRoom(document);
    }

    public async Task SaveAsync(GameRoom room, CancellationToken cancellationToken = default)
    {
        var table = await GetTableAsync();
        var document = SerializeGameRoom(room);
        await table.PutItemAsync(document);
    }

    public async Task<string> CreateAsync(GameRoom room, CancellationToken cancellationToken = default)
    {
        var table = await GetTableAsync();
        var document = SerializeGameRoom(room);
        await table.PutItemAsync(document);
        return room.RoomCode;
    }

    private static Document SerializeGameRoom(GameRoom room)
    {
        var json = JsonSerializer.Serialize(room);
        var document = Document.FromJson(json);
        document["RoomCode"] = room.RoomCode;  // Ensure partition key is set
        return document;
    }

    private static GameRoom DeserializeGameRoom(Document document)
    {
        var json = document.ToJson();
        var room = JsonSerializer.Deserialize<GameRoom>(json) ?? throw new InvalidOperationException("Failed to deserialize room");
        return room;
    }
}
