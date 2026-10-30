using Amazon.ApiGatewayManagementApi;
using Amazon.ApiGatewayManagementApi.Model;
using ChipTracker.Application;
using ChipTracker.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace ChipTracker.Infrastructure.Realtime;

/// <summary>
/// Fans a room event out to every connection of the room through API Gateway's PostToConnection.
/// Must complete before the HTTP response returns: Lambda freezes the environment afterwards.
/// </summary>
public class ApiGatewayRoomEventPublisher : IRoomEventPublisher
{
    private readonly IAmazonApiGatewayManagementApi _api;
    private readonly IConnectionRepository _connections;
    private readonly ILogger<ApiGatewayRoomEventPublisher> _logger;

    public ApiGatewayRoomEventPublisher(IAmazonApiGatewayManagementApi api, IConnectionRepository connections,
        ILogger<ApiGatewayRoomEventPublisher> logger)
    {
        _api = api;
        _connections = connections;
        _logger = logger;
    }

    public async Task PublishAsync(RoomEvent evt, CancellationToken cancellationToken = default)
    {
        var bytes = System.Text.Encoding.UTF8.GetBytes(RoomEventSerializer.Serialize(evt));

        var connections = await _connections.ListByRoomAsync(evt.RoomCode, cancellationToken);
        await Task.WhenAll(connections.Select(c => PostAsync(c, bytes, cancellationToken)));
    }

    private async Task PostAsync(RoomConnection connection, byte[] payload, CancellationToken cancellationToken)
    {
        try
        {
            await _api.PostToConnectionAsync(new PostToConnectionRequest
            {
                ConnectionId = connection.ConnectionId,
                Data = new MemoryStream(payload)
            }, cancellationToken);
        }
        catch (GoneException)
        {
            try
            {
                await _connections.RemoveAsync(connection.RoomCode, connection.ConnectionId, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to remove stale connection {ConnectionId}", connection.ConnectionId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to post to connection {ConnectionId} in room {RoomCode}",
                connection.ConnectionId, connection.RoomCode);
        }
    }
}
