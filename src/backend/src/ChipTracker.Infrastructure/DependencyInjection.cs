using Amazon.ApiGatewayManagementApi;
using Amazon.DynamoDBv2;
using Amazon.Runtime;
using ChipTracker.Application.Interfaces;
using ChipTracker.Infrastructure.Persistence;
using ChipTracker.Infrastructure.Realtime;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace ChipTracker.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var useLocal = configuration.GetValue("DynamoDB:UseLocal", false);
        var serviceUrl = configuration.GetValue("DynamoDB:ServiceUrl", "");
        var tableName = configuration.GetValue("DynamoDB:TableName", "ChipTracker_Rooms");

        if (useLocal && !string.IsNullOrEmpty(serviceUrl))
        {
            services.AddSingleton<IAmazonDynamoDB>(new AmazonDynamoDBClient(
                new BasicAWSCredentials("local", "local"),
                new AmazonDynamoDBConfig { ServiceURL = serviceUrl }));
            services.AddHostedService<DynamoDbTableInitializer>();
        }
        else
        {
            services.AddSingleton<IAmazonDynamoDB>(new AmazonDynamoDBClient());
        }

        var roomTtlDays = configuration.GetValue("DynamoDB:RoomTtlDays", 1);

        // One shared table handle: no per-request (or cold-start) DescribeTable call.
        services.AddSingleton<Amazon.DynamoDBv2.DocumentModel.ITable>(sp =>
            DynamoDbRoomRepository.BuildTable(sp.GetRequiredService<IAmazonDynamoDB>(), tableName));
        services.AddScoped<IRoomRepository>(sp =>
            new DynamoDbRoomRepository(sp.GetRequiredService<IAmazonDynamoDB>(), tableName, roomTtlDays,
                sp.GetRequiredService<ILoggerFactory>().CreateLogger<DynamoDbRoomRepository>(),
                sp.GetRequiredService<Amazon.DynamoDBv2.DocumentModel.ITable>()));

        return services;
    }

    /// <summary>Registers the API Gateway WebSocket push path (Realtime:Mode=ApiGateway).</summary>
    public static IServiceCollection AddApiGatewayRealtime(this IServiceCollection services, IConfiguration configuration)
    {
        var endpoint = configuration["Realtime:ManagementEndpoint"]
            ?? throw new InvalidOperationException("Realtime:ManagementEndpoint is required when Realtime:Mode=ApiGateway");
        var connectionsTable = configuration.GetValue("DynamoDB:ConnectionsTableName",
            DynamoDbConnectionRepository.DefaultTableName);

        services.AddSingleton<IAmazonApiGatewayManagementApi>(
            new AmazonApiGatewayManagementApiClient(new AmazonApiGatewayManagementApiConfig { ServiceURL = endpoint }));
        services.AddScoped<IConnectionRepository>(sp =>
            new DynamoDbConnectionRepository(sp.GetRequiredService<IAmazonDynamoDB>(), connectionsTable));
        services.AddScoped<IRoomEventPublisher, ApiGatewayRoomEventPublisher>();
        return services;
    }

    /// <summary>Registers only the connection repository (used by the WsConnect Lambda).</summary>
    public static IServiceCollection AddConnectionRepository(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionsTable = configuration.GetValue("DynamoDB:ConnectionsTableName",
            DynamoDbConnectionRepository.DefaultTableName);
        services.AddScoped<IConnectionRepository>(sp =>
            new DynamoDbConnectionRepository(sp.GetRequiredService<IAmazonDynamoDB>(), connectionsTable));
        return services;
    }
}
