namespace ChipTracker.Presentation.Endpoints;

public class CreateRoomRequest
{
    public required List<PlayerInput> Players { get; set; }
    public required int SmallBlind { get; set; }
    public required int BigBlind { get; set; }
}

public class PlayerInput
{
    public required string Name { get; set; }
    public required int Stack { get; set; }
}
