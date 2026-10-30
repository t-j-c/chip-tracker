using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using ChipTracker.Application;
using ChipTracker.Application.Interfaces;

namespace ChipTracker.Presentation.Realtime;

/// <summary>A connected socket plus the lock that serializes sends (WebSocket.SendAsync is not thread-safe).</summary>
public sealed class RoomSocket
{
    private readonly SemaphoreSlim _sendLock = new(1, 1);

    public RoomSocket(WebSocket socket, string? playerId)
    {
        Socket = socket;
        PlayerId = playerId;
    }

    public WebSocket Socket { get; }
    public string? PlayerId { get; }

    public async Task SendAsync(byte[] payload, CancellationToken cancellationToken)
    {
        await _sendLock.WaitAsync(cancellationToken);
        try
        {
            if (Socket.State == WebSocketState.Open)
                await Socket.SendAsync(payload, WebSocketMessageType.Text, true, cancellationToken);
        }
        finally
        {
            _sendLock.Release();
        }
    }
}

/// <summary>Singleton room → sockets map used when Realtime:Mode=InProcess.</summary>
public class InProcessConnectionRegistry
{
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<RoomSocket, byte>> _rooms = new();

    public void Add(string roomCode, RoomSocket socket) =>
        _rooms.GetOrAdd(roomCode, _ => new ConcurrentDictionary<RoomSocket, byte>())[socket] = 0;

    public void Remove(string roomCode, RoomSocket socket)
    {
        if (_rooms.TryGetValue(roomCode, out var sockets))
            sockets.TryRemove(socket, out _);
    }

    public IReadOnlyList<RoomSocket> GetSockets(string roomCode) =>
        _rooms.TryGetValue(roomCode, out var sockets) ? sockets.Keys.ToList() : [];
}

public class InProcessRoomEventPublisher : IRoomEventPublisher
{
    private readonly InProcessConnectionRegistry _registry;
    private readonly ILogger<InProcessRoomEventPublisher> _logger;

    public InProcessRoomEventPublisher(InProcessConnectionRegistry registry, ILogger<InProcessRoomEventPublisher> logger)
    {
        _registry = registry;
        _logger = logger;
    }

    public async Task PublishAsync(RoomEvent evt, CancellationToken cancellationToken = default)
    {
        var sockets = _registry.GetSockets(evt.RoomCode);
        if (sockets.Count == 0)
            return;

        var payload = Encoding.UTF8.GetBytes(RoomEventSerializer.Serialize(evt));
        await Task.WhenAll(sockets.Select(async s =>
        {
            try
            {
                await s.SendAsync(payload, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to send {EventType} to a socket in room {RoomCode}", evt.Type, evt.RoomCode);
                _registry.Remove(evt.RoomCode, s);
            }
        }));
    }
}
