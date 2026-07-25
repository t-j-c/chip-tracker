namespace ChipTracker.Presentation.Endpoints;

public class CreateRoomRequest
{
    public required int StartingStack { get; set; }
    public required int SmallBlind { get; set; }
    public required int BigBlind { get; set; }
}

public class JoinRoomRequest
{
    public required string Name { get; set; }
}

public class StartGameRequest
{
    public required string PlayerId { get; set; }
}
