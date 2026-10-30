using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using ChipTracker.Application.Commands;
using ChipTracker.Application.Queries;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Enums;
using MediatR;

namespace ChipTracker.Presentation.Endpoints;

public class ActionBody
{
    public string PlayerId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public int? Amount { get; set; }
}

public class PlayerBody
{
    public string PlayerId { get; set; } = string.Empty;
}

public class ShowdownBody
{
    public string? WinnerPlayerId { get; set; }
    public bool IsSplit { get; set; }
    public List<PotAwardDto>? Awards { get; set; }
}

public static class GameCommandEndpoints
{
    public const string RateLimitPolicy = "command";

    public static void MapGameCommands(this RouteGroupBuilder api)
    {
        var room = api.MapGroup("/rooms/{roomCode}").RequireRateLimiting(RateLimitPolicy);

        room.MapPost("/actions", async (string roomCode, ActionBody body, IMediator mediator) =>
        {
            if (!Enum.TryParse<PokerAction>(body.Action, ignoreCase: true, out var action)
                || !Enum.IsDefined(action))
                return Failure(StatusCodes.Status400BadRequest, $"Unknown action: {body.Action}");

            var result = await mediator.Send(new ProcessActionCommand
            {
                RoomCode = roomCode, PlayerId = body.PlayerId, Action = action, Amount = body.Amount
            });
            return Respond(result.Success, result.Error, result.Snapshot);
        });

        room.MapPost("/undo/request", async (string roomCode, PlayerBody body, IMediator mediator) =>
        {
            var result = await mediator.Send(new RequestUndoCommand { RoomCode = roomCode, PlayerId = body.PlayerId });
            return Respond(result.Success, result.Error, result.Snapshot);
        });

        room.MapPost("/undo/approve", async (string roomCode, PlayerBody body, IMediator mediator) =>
        {
            var result = await mediator.Send(new UndoActionCommand { RoomCode = roomCode, PlayerId = body.PlayerId });
            return Respond(result.Success, result.Error, result.Snapshot);
        });

        room.MapPost("/undo/decline", async (string roomCode, PlayerBody body, IMediator mediator) =>
        {
            var result = await mediator.Send(new ClearUndoRequestCommand
                { RoomCode = roomCode, PlayerId = body.PlayerId, IsCancel = false });
            return Respond(result.Success, result.Error, result.Snapshot);
        });

        room.MapPost("/undo/cancel", async (string roomCode, PlayerBody body, IMediator mediator) =>
        {
            var result = await mediator.Send(new ClearUndoRequestCommand
                { RoomCode = roomCode, PlayerId = body.PlayerId, IsCancel = true });
            return Respond(result.Success, result.Error, result.Snapshot);
        });

        room.MapPost("/showdown", async (string roomCode, ShowdownBody body, IMediator mediator) =>
        {
            var result = await mediator.Send(new ResolveShowdownCommand
            {
                RoomCode = roomCode,
                WinnerPlayerId = body.WinnerPlayerId ?? string.Empty,
                IsSplit = body.IsSplit,
                Awards = (body.Awards ?? []).Select(a => new PotAward
                    { PotIndex = a.PotIndex, WinnerPlayerIds = a.WinnerPlayerIds }).ToList()
            });
            return Respond(result.Success, result.Error, result.Snapshot);
        });

        room.MapPost("/rebuy", async (string roomCode, PlayerBody body, IMediator mediator) =>
        {
            var result = await mediator.Send(new RebuyCommand { RoomCode = roomCode, PlayerId = body.PlayerId });
            return Respond(result.Success, result.Error, result.Snapshot);
        });

        room.MapPost("/decline-rebuy", async (string roomCode, PlayerBody body, IMediator mediator) =>
        {
            var result = await mediator.Send(new DeclineRebuyCommand { RoomCode = roomCode, PlayerId = body.PlayerId });
            return Respond(result.Success, result.Error, result.Snapshot);
        });
    }

    private static IResult Failure(int status, string? error) =>
        Results.Json(new { success = false, error }, statusCode: status);

    /// <summary>Maps a command result onto the shared { success, revision, roomInfo, gameState } response.</summary>
    public static IResult Respond(bool success, string? error, RoomSnapshot? snapshot)
    {
        if (success && snapshot != null)
        {
            return Results.Ok(new
            {
                success = true,
                revision = snapshot.Revision,
                roomInfo = snapshot.RoomInfo,
                gameState = snapshot.GameState,
                error = (string?)null
            });
        }

        var status = string.Equals(error, "Room not found", StringComparison.Ordinal)
            ? StatusCodes.Status404NotFound
            : StatusCodes.Status400BadRequest;
        return Failure(status, error);
    }
}
