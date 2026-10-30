using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ChipTracker.Infrastructure.Persistence;

public class DynamoDbTableInitializer : IHostedService
{
    private readonly IAmazonDynamoDB _dynamoDbClient;
    private readonly ILogger<DynamoDbTableInitializer> _logger;
    private const string TableName = "ChipTracker_Rooms";
    private const string ConnectionsTableName = DynamoDbConnectionRepository.DefaultTableName;

    public DynamoDbTableInitializer(IAmazonDynamoDB dynamoDbClient, ILogger<DynamoDbTableInitializer> logger)
    {
        _dynamoDbClient = dynamoDbClient;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await EnsureTableAsync(TableName, [new KeySchemaElement { AttributeName = "RoomCode", KeyType = KeyType.HASH }],
            [new AttributeDefinition { AttributeName = "RoomCode", AttributeType = ScalarAttributeType.S }],
            cancellationToken);

        await EnsureTableAsync(ConnectionsTableName,
            [
                new KeySchemaElement { AttributeName = "RoomCode", KeyType = KeyType.HASH },
                new KeySchemaElement { AttributeName = "ConnectionId", KeyType = KeyType.RANGE }
            ],
            [
                new AttributeDefinition { AttributeName = "RoomCode", AttributeType = ScalarAttributeType.S },
                new AttributeDefinition { AttributeName = "ConnectionId", AttributeType = ScalarAttributeType.S }
            ],
            cancellationToken);
    }

    private async Task EnsureTableAsync(string tableName, List<KeySchemaElement> keySchema,
        List<AttributeDefinition> attributes, CancellationToken cancellationToken)
    {
        try
        {
            await _dynamoDbClient.DescribeTableAsync(tableName, cancellationToken);
            _logger.LogInformation("DynamoDB table '{TableName}' already exists.", tableName);
        }
        catch (ResourceNotFoundException)
        {
            _logger.LogInformation("Creating DynamoDB table '{TableName}'...", tableName);
            await _dynamoDbClient.CreateTableAsync(new CreateTableRequest
            {
                TableName = tableName,
                KeySchema = keySchema,
                AttributeDefinitions = attributes,
                BillingMode = BillingMode.PAY_PER_REQUEST
            }, cancellationToken);

            // Wait for table to become active
            bool active = false;
            while (!active)
            {
                await Task.Delay(500, cancellationToken);
                var desc = await _dynamoDbClient.DescribeTableAsync(tableName, cancellationToken);
                active = desc.Table.TableStatus == TableStatus.ACTIVE;
            }

            _logger.LogInformation("DynamoDB table '{TableName}' created successfully.", tableName);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
