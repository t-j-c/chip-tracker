using System.Net.WebSockets;
using System.Text;
using System.Text.RegularExpressions;
using ChipTracker.Application.Interfaces;

namespace ChipTracker.Presentation.Realtime;

public static partial class WebSocketEndpoint
{
    private static readonly byte[] Pong = LoadPong();

    private static byte[] LoadPong()
    {
        using var stream = typeof(WebSocketEndpoint).Assembly.GetManifestResourceStream(
            "ChipTracker.Presentation.Realtime.HeartbeatPong.json")
            ?? throw new InvalidOperationException("The WebSocket heartbeat response is missing.");
        using var reader = new StreamReader(stream);
        return Encoding.UTF8.GetBytes(reader.ReadToEnd().Trim());
    }

    [GeneratedRegex("^[A-Z0-9]{6}$")]
    private static partial Regex RoomCodePattern();

    public static void MapInProcessWebSocket(this WebApplication app)
    {
        app.UseWebSockets();
        app.Map("/ws", HandleAsync);
    }

    private static async Task HandleAsync(HttpContext context)
    {
        if (!context.WebSockets.IsWebSocketRequest)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            return;
        }

        var room = context.Request.Query["room"].ToString();
        if (!RoomCodePattern().IsMatch(room))
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            return;
        }

        var repository = context.RequestServices.GetRequiredService<IRoomRepository>();
        if (!await repository.ExistsAsync(room, context.RequestAborted))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        var playerId = context.Request.Query["playerId"].ToString();
        var registry = context.RequestServices.GetRequiredService<InProcessConnectionRegistry>();
        var logger = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("ChipTracker.WebSocket");

        using var socket = await context.WebSockets.AcceptWebSocketAsync();
        var roomSocket = new RoomSocket(socket, string.IsNullOrEmpty(playerId) ? null : playerId);
        registry.Add(room, roomSocket);
        logger.LogInformation("WebSocket connected to room {RoomCode} (player {PlayerId})", room, playerId);

        try
        {
            var buffer = new byte[256];
            while (socket.State == WebSocketState.Open)
            {
                var result = await socket.ReceiveAsync(buffer, context.RequestAborted);
                if (result.MessageType == WebSocketMessageType.Close)
                    break;
                if (result.MessageType == WebSocketMessageType.Text && result.EndOfMessage)
                    await roomSocket.SendAsync(Pong, context.RequestAborted);
            }
        }
        catch (Exception ex) when (ex is WebSocketException or OperationCanceledException)
        {
        }
        finally
        {
            registry.Remove(room, roomSocket);
            logger.LogInformation("WebSocket disconnected from room {RoomCode}", room);
        }
    }
}
