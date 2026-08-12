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

    public DynamoDbTableInitializer(IAmazonDynamoDB dynamoDbClient, ILogger<DynamoDbTableInitializer> logger)
    {
        _dynamoDbClient = dynamoDbClient;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _dynamoDbClient.DescribeTableAsync(TableName, cancellationToken);
            _logger.LogInformation("DynamoDB table '{TableName}' already exists.", TableName);
        }
        catch (ResourceNotFoundException)
        {
            _logger.LogInformation("Creating DynamoDB table '{TableName}'...", TableName);
            await _dynamoDbClient.CreateTableAsync(new CreateTableRequest
            {
                TableName = TableName,
                KeySchema =
                [
                    new KeySchemaElement { AttributeName = "RoomCode", KeyType = KeyType.HASH }
                ],
                AttributeDefinitions =
                [
                    new AttributeDefinition { AttributeName = "RoomCode", AttributeType = ScalarAttributeType.S }
                ],
                BillingMode = BillingMode.PAY_PER_REQUEST
            }, cancellationToken);

            // Wait for table to become active
            bool active = false;
            while (!active)
            {
                await Task.Delay(500, cancellationToken);
                var desc = await _dynamoDbClient.DescribeTableAsync(TableName, cancellationToken);
                active = desc.Table.TableStatus == TableStatus.ACTIVE;
            }

            _logger.LogInformation("DynamoDB table '{TableName}' created successfully.", TableName);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
