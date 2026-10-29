using Amazon.DynamoDBv2;
using Amazon.Runtime;
using ChipTracker.Application.Interfaces;
using ChipTracker.Infrastructure.Persistence;
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

        services.AddScoped<IRoomRepository>(sp =>
            new DynamoDbRoomRepository(sp.GetRequiredService<IAmazonDynamoDB>(), tableName, roomTtlDays,
                sp.GetRequiredService<ILoggerFactory>().CreateLogger<DynamoDbRoomRepository>()));

        return services;
    }
}
