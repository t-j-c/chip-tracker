using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Amazon.Runtime;
using ChipTracker.Domain.Entities;
using ChipTracker.Infrastructure.Persistence;
using FluentAssertions;
using Testcontainers.DynamoDb;

namespace ChipTracker.Integration.Tests;

public class DynamoDbRoomRepositoryTests : IAsyncLifetime
{
    private const string Table = "ChipTracker_Rooms";
    private readonly DynamoDbContainer _container = new DynamoDbBuilder().Build();
    private AmazonDynamoDBClient _client = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        _client = new AmazonDynamoDBClient(new BasicAWSCredentials("local", "local"),
            new AmazonDynamoDBConfig { ServiceURL = _container.GetConnectionString() });
        await _client.CreateTableAsync(new CreateTableRequest
        {
            TableName = Table,
            KeySchema = [new KeySchemaElement("RoomCode", KeyType.HASH)],
            AttributeDefinitions = [new AttributeDefinition("RoomCode", ScalarAttributeType.S)],
            BillingMode = BillingMode.PAY_PER_REQUEST
        });
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _container.DisposeAsync();
    }

    private DynamoDbRoomRepository Repo(int ttlDays = 1) => new(_client, Table, ttlDays);

    private static GameRoom Room(string code) => new() { RoomCode = code, StartingStack = 1000, SmallBlind = 10, BigBlind = 20 };

    [Fact]
    public async Task SaveAndGet_RoundTripsAndWritesExpiration()
    {
        var repo = Repo();
        await repo.SaveAsync(Room("RT0001"));

        var loaded = await repo.GetByRoomCodeAsync("RT0001");
        loaded.Should().NotBeNull();
        loaded!.StartingStack.Should().Be(1000);

        var raw = await _client.GetItemAsync(Table, new() { ["RoomCode"] = new AttributeValue("RT0001") });
        long.Parse(raw.Item["ExpirationTime"].N).Should().BeGreaterThan(DateTimeOffset.UtcNow.ToUnixTimeSeconds());
    }

    [Fact]
    public async Task ExpiredRoom_ReadsAsNotFound()
    {
        var repo = Repo(ttlDays: -1);
        await repo.SaveAsync(Room("EXP001"));

        (await repo.GetByRoomCodeAsync("EXP001")).Should().BeNull();
    }

    [Fact]
    public async Task TryCreate_ReturnsFalseWhenCodeTaken()
    {
        var repo = Repo();
        (await repo.TryCreateAsync(Room("DUP001"))).Should().BeTrue();
        (await repo.TryCreateAsync(Room("DUP001"))).Should().BeFalse();
    }

    [Fact]
    public async Task TryCreate_ReusesExpiredCode()
    {
        await Repo(ttlDays: -1).SaveAsync(Room("OLD001"));

        (await Repo().TryCreateAsync(Room("OLD001"))).Should().BeTrue();
        (await Repo().GetByRoomCodeAsync("OLD001")).Should().NotBeNull();
    }
}
