namespace ChipTracker.Presentation.RateLimiting;

public class RateLimitOptions
{
    public const string SectionName = "RateLimiting";

    public int CreateRoomPerMinute { get; set; } = 10;
    public int JoinPerMinute { get; set; } = 30;
    public int ReadPerMinute { get; set; } = 120;
    public int CommandBurst { get; set; } = 20;
    public int CommandsPerSecond { get; set; } = 5;
    public int ForwardLimit { get; set; } = 1;

    public const string CloudFrontViewerAddressSource = "CloudFrontViewerAddress";

    /// <summary>"ForwardedFor" (default) or "CloudFrontViewerAddress".</summary>
    public string ClientIpSource { get; set; } = "ForwardedFor";
}
