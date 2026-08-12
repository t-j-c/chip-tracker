using ChipTracker.Application.DTOs;
using ChipTracker.Application.Interfaces;
using MediatR;

namespace ChipTracker.Application.Queries;

/// <summary>
/// Query to fetch activity log for a specific game room.
/// Supports pagination and filtering.
/// </summary>
public record GetGameActivityLogQuery(
    string RoomCode,
    int? Limit = 50,
    int? Offset = 0
) : IRequest<GetGameActivityLogResponse>;

public record GetGameActivityLogResponse(
    List<ActivityEntryDto> Entries,
    int Total,
    int Limit,
    int Offset
);

/// <summary>
/// Handler for GetGameActivityLogQuery.
/// Fetches activity log from room and maps to DTOs.
/// </summary>
public class GetGameActivityLogQueryHandler : IRequestHandler<GetGameActivityLogQuery, GetGameActivityLogResponse>
{
    private readonly IRoomRepository _roomRepository;

    public GetGameActivityLogQueryHandler(IRoomRepository roomRepository)
    {
        _roomRepository = roomRepository;
    }

    public async Task<GetGameActivityLogResponse> Handle(GetGameActivityLogQuery request, CancellationToken cancellationToken)
    {
        var room = await _roomRepository.GetByRoomCodeAsync(request.RoomCode, cancellationToken);
        
        if (room == null)
            throw new InvalidOperationException($"Game room {request.RoomCode} not found");

        var limit = request.Limit ?? 50;
        var offset = request.Offset ?? 0;

        var total = room.ActivityLog.Count;
        var entries = room.ActivityLog
            .Skip(offset)
            .Take(limit)
            .Select(ActivityEntryDto.MapFromDomain)
            .ToList();

        return new GetGameActivityLogResponse(entries, total, limit, offset);
    }
}
