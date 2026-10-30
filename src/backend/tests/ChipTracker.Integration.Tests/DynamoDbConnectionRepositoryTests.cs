using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Amazon.Runtime;
using ChipTracker.Domain.Entities;
using ChipTracker.Infrastructure.Persistence;
using FluentAssertions;
using Testcontainers.DynamoDb;

namespace ChipTracker.Integration.Tests;

public class DynamoDbConnectionRepositoryTests : IAsyncLifetime
{
    private const string Rooms = "ChipTracker_Rooms";
    private const string Connections = DynamoDbConnectionRepository.DefaultTableName;
    private readonly DynamoDbContainer _container = new DynamoDbBuilder().Build();
    private AmazonDynamoDBClient _client = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        _client = new AmazonDynamoDBClient(new BasicAWSCredentials("local", "local"),
            new AmazonDynamoDBConfig { ServiceURL = _container.GetConnectionString() });
        await _client.CreateTableAsync(new CreateTableRequest
        {
            TableName = Rooms,
            KeySchema = [new KeySchemaElement("RoomCode", KeyType.HASH)],
            AttributeDefinitions = [new AttributeDefinition("RoomCode", ScalarAttributeType.S)],
            BillingMode = BillingMode.PAY_PER_REQUEST
        });
        await _client.CreateTableAsync(new CreateTableRequest
        {
            TableName = Connections,
            KeySchema =
            [
                new KeySchemaElement("RoomCode", KeyType.HASH),
                new KeySchemaElement("ConnectionId", KeyType.RANGE)
            ],
            AttributeDefinitions =
            [
                new AttributeDefinition("RoomCode", ScalarAttributeType.S),
                new AttributeDefinition("ConnectionId", ScalarAttributeType.S)
            ],
            BillingMode = BillingMode.PAY_PER_REQUEST
        });
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _container.DisposeAsync();
    }

    [Fact]
    public async Task AddListRemove_WorksPerRoom()
    {
        var repo = new DynamoDbConnectionRepository(_client);
        await repo.AddAsync("AAAAAA", "c1", "p1");
        await repo.AddAsync("AAAAAA", "c2", null);
        await repo.AddAsync("BBBBBB", "c3", "p3");

        var room = await repo.ListByRoomAsync("AAAAAA");
        room.Select(c => c.ConnectionId).Should().BeEquivalentTo("c1", "c2");
        room.Single(c => c.ConnectionId == "c1").PlayerId.Should().Be("p1");
        room.Single(c => c.ConnectionId == "c2").PlayerId.Should().BeNull();

        await repo.RemoveAsync("AAAAAA", "c1");

        (await repo.ListByRoomAsync("AAAAAA")).Select(c => c.ConnectionId).Should().BeEquivalentTo("c2");
        (await repo.ListByRoomAsync("BBBBBB")).Should().HaveCount(1);
        await repo.Invoking(r => r.RemoveAsync("AAAAAA", "missing")).Should().NotThrowAsync();
    }

    [Fact]
    public async Task Add_WritesTtlAboutTwoHoursFifteenMinutesAhead()
    {
        var repo = new DynamoDbConnectionRepository(_client);
        await repo.AddAsync("AAAAAA", "c1", "p1");

        var item = (await _client.GetItemAsync(Connections, new Dictionary<string, AttributeValue>
        {
            ["RoomCode"] = new() { S = "AAAAAA" },
            ["ConnectionId"] = new() { S = "c1" }
        })).Item;

        var expected = DateTimeOffset.UtcNow.AddMinutes(135).ToUnixTimeSeconds();
        long.Parse(item["ExpirationTime"].N).Should().BeInRange(expected - 30, expected + 30);
    }

    [Fact]
    public async Task List_IgnoresExpiredRows()
    {
        var repo = new DynamoDbConnectionRepository(_client);
        await repo.AddAsync("AAAAAA", "live", null);
        await _client.PutItemAsync(Connections, new Dictionary<string, AttributeValue>
        {
            ["RoomCode"] = new() { S = "AAAAAA" },
            ["ConnectionId"] = new() { S = "dead" },
            ["ExpirationTime"] = new() { N = (DateTimeOffset.UtcNow.ToUnixTimeSeconds() - 10).ToString() }
        });

        (await repo.ListByRoomAsync("AAAAAA")).Select(c => c.ConnectionId).Should().BeEquivalentTo("live");
    }

    [Fact]
    public async Task RoomExists_ReflectsPresenceAndExpiry()
    {
        var rooms = new DynamoDbRoomRepository(_client, Rooms, 1);
        var room = new GameRoom { RoomCode = "AAAAAA", StartingStack = 1000, SmallBlind = 10, BigBlind = 20 };
        (await rooms.ExistsAsync("AAAAAA")).Should().BeFalse();

        await rooms.TryCreateAsync(room);
        (await rooms.ExistsAsync("AAAAAA")).Should().BeTrue();

        var expired = new DynamoDbRoomRepository(_client, Rooms, -1);
        await expired.TryCreateAsync(new GameRoom { RoomCode = "BBBBBB", StartingStack = 1000, SmallBlind = 10, BigBlind = 20 });
        (await rooms.ExistsAsync("BBBBBB")).Should().BeFalse();
    }
}
