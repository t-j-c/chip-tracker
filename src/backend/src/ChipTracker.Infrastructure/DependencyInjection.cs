using Amazon.DynamoDBv2;
using ChipTracker.Application.Interfaces;
using ChipTracker.Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

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
                new AmazonDynamoDBConfig { ServiceURL = serviceUrl }));
        }
        else
        {
            services.AddSingleton<IAmazonDynamoDB>(new AmazonDynamoDBClient());
        }

        services.AddScoped<IRoomRepository>(sp =>
            new DynamoDbRoomRepository(sp.GetRequiredService<IAmazonDynamoDB>(), tableName));

        return services;
    }
}
