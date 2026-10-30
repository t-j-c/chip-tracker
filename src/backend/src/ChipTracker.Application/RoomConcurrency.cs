using MediatR;

namespace ChipTracker.Application;

/// <summary>Thrown by the repository when a room was modified by someone else between load and save.</summary>
public class RoomConcurrencyException : Exception
{
    public const string DefaultMessage = "The game changed while processing your request. Please try again.";

    public RoomConcurrencyException() : base(DefaultMessage)
    {
    }

    public RoomConcurrencyException(string message) : base(message)
    {
    }

    public RoomConcurrencyException(string message, Exception innerException) : base(message, innerException)
    {
    }
}

/// <summary>Marker for state-changing commands that load, mutate and save a room.</summary>
public interface IRoomCommand
{
}

/// <summary>
/// Re-runs a room command when its save loses an optimistic-concurrency race.
/// Handlers must not have side effects (e.g. notifications) before SaveAsync succeeds.
/// </summary>
public class RoomConcurrencyRetryBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public const int MaxAttempts = 3;

    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        if (request is not IRoomCommand)
            return await next();

        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return await next();
            }
            catch (RoomConcurrencyException) when (attempt < MaxAttempts)
            {
                await Task.Delay(Random.Shared.Next(10, 51), cancellationToken);
            }
        }
    }
}
