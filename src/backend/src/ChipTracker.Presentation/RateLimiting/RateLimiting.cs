using System.Threading.RateLimiting;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;

namespace ChipTracker.Presentation.RateLimiting;

public class RateLimitOptions
{
    public const string SectionName = "RateLimiting";

    public int CreateRoomPerMinute { get; set; } = 10;
    public int JoinPerMinute { get; set; } = 30;
    public int ReadPerMinute { get; set; } = 120;
    public int HubConnectPerMinute { get; set; } = 120;
    public int HubInvocationBurst { get; set; } = 20;
    public int HubInvocationsPerSecond { get; set; } = 5;
    public int ForwardLimit { get; set; } = 1;
}

/// <summary>
/// Throttles hub method calls with a token bucket kept per connection.
/// </summary>
public class HubRateLimitFilter : IHubFilter
{
    private const string LimiterKey = "RateLimiter";
    private readonly RateLimitOptions _options;

    public HubRateLimitFilter(IOptions<RateLimitOptions> options)
    {
        _options = options.Value;
    }

    public Task OnConnectedAsync(HubLifetimeContext context, Func<HubLifetimeContext, Task> next)
    {
        context.Context.Items[LimiterKey] = new TokenBucketRateLimiter(new TokenBucketRateLimiterOptions
        {
            TokenLimit = _options.HubInvocationBurst,
            TokensPerPeriod = _options.HubInvocationsPerSecond,
            ReplenishmentPeriod = TimeSpan.FromSeconds(1),
            QueueLimit = 0,
            AutoReplenishment = true
        });
        return next(context);
    }

    public Task OnDisconnectedAsync(HubLifetimeContext context, Exception? exception, Func<HubLifetimeContext, Exception?, Task> next)
    {
        if (context.Context.Items.TryGetValue(LimiterKey, out var limiter) && limiter is IDisposable disposable)
            disposable.Dispose();
        return next(context, exception);
    }

    public async ValueTask<object?> InvokeMethodAsync(HubInvocationContext invocationContext,
        Func<HubInvocationContext, ValueTask<object?>> next)
    {
        if (invocationContext.Context.Items.TryGetValue(LimiterKey, out var value) && value is RateLimiter limiter)
        {
            using var lease = limiter.AttemptAcquire();
            if (!lease.IsAcquired)
                throw new HubException("Too many requests, slow down and try again.");
        }
        return await next(invocationContext);
    }
}
