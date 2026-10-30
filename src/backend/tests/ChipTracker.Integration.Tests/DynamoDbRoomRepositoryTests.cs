using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Amazon.Runtime;
using ChipTracker.Application;
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
    public async Task Save_WithStaleCopy_ThrowsConcurrencyAndKeepsFirstWrite()
    {
        var repo = Repo();
        await repo.TryCreateAsync(Room("CC0001"));

        var a = (await repo.GetByRoomCodeAsync("CC0001"))!;
        var b = (await repo.GetByRoomCodeAsync("CC0001"))!;
        a.StartingStack = 2000;
        await repo.SaveAsync(a);
        a.Revision.Should().Be(2);

        b.StartingStack = 3000;
        var act = () => repo.SaveAsync(b);
        await act.Should().ThrowAsync<RoomConcurrencyException>();
        b.Revision.Should().Be(1);

        var loaded = (await repo.GetByRoomCodeAsync("CC0001"))!;
        loaded.StartingStack.Should().Be(2000);
        loaded.Revision.Should().Be(2);
    }

    [Fact]
    public async Task LegacyItemWithoutRevision_LoadsAsZeroAndSavesAsOne()
    {
        await _client.PutItemAsync(Table, new()
        {
            ["RoomCode"] = new AttributeValue("LEG001"),
            ["StartingStack"] = new AttributeValue { N = "500" },
            ["ExpirationTime"] = new AttributeValue { N = DateTimeOffset.UtcNow.AddDays(1).ToUnixTimeSeconds().ToString() }
        });
        var repo = Repo();

        var room = (await repo.GetByRoomCodeAsync("LEG001"))!;
        room.Revision.Should().Be(0);

        await repo.SaveAsync(room);
        (await repo.GetByRoomCodeAsync("LEG001"))!.Revision.Should().Be(1);
    }

    [Fact]
    public async Task TryCreate_WritesRevisionOne()
    {
        var repo = Repo();
        await repo.TryCreateAsync(Room("REV001"));

        (await repo.GetByRoomCodeAsync("REV001"))!.Revision.Should().Be(1);
    }

    [Fact]
    public async Task TryCreate_ReusesExpiredCode()
    {
        await Repo(ttlDays: -1).SaveAsync(Room("OLD001"));

        (await Repo().TryCreateAsync(Room("OLD001"))).Should().BeTrue();
        (await Repo().GetByRoomCodeAsync("OLD001")).Should().NotBeNull();
    }
}
