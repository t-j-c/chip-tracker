using ChipTracker.Application;
using ChipTracker.Application.Commands;
using FluentAssertions;
using MediatR;

namespace ChipTracker.Application.Tests;

public class RoomConcurrencyRetryBehaviorTests
{
    private sealed record NonRoomRequest : IRequest<string>;

    private static Task<string> Run<TRequest>(TRequest request, Func<int, string> handler, out Func<int> attempts)
        where TRequest : IRequest<string>
    {
        var count = 0;
        attempts = () => count;
        var behavior = new RoomConcurrencyRetryBehavior<TRequest, string>();
        return behavior.Handle(request, () => Task.FromResult(handler(++count)), CancellationToken.None);
    }

    [Fact]
    public async Task RoomCommand_RetriesAfterOneConflict_ThenSucceeds()
    {
        var result = await Run(new StringRoomCommand(), n => n == 1 ? throw new RoomConcurrencyException() : "ok", out var attempts);

        result.Should().Be("ok");
        attempts().Should().Be(2);
    }

    [Fact]
    public async Task RoomCommand_RethrowsAfterThreeConflicts()
    {
        var act = () => Run(new StringRoomCommand(), _ => throw new RoomConcurrencyException(), out _);

        await act.Should().ThrowAsync<RoomConcurrencyException>();
        var count = 0;
        var behavior = new RoomConcurrencyRetryBehavior<StringRoomCommand, string>();
        try
        {
            await behavior.Handle(new StringRoomCommand(), () => { count++; throw new RoomConcurrencyException(); }, CancellationToken.None);
        }
        catch (RoomConcurrencyException)
        {
        }
        count.Should().Be(3);
    }

    [Fact]
    public async Task NonRoomCommand_IsNotRetried()
    {
        var count = 0;
        var behavior = new RoomConcurrencyRetryBehavior<NonRoomRequest, string>();

        var act = () => behavior.Handle(new NonRoomRequest(), () => { count++; throw new RoomConcurrencyException(); }, CancellationToken.None);

        await act.Should().ThrowAsync<RoomConcurrencyException>();
        count.Should().Be(1);
    }

    [Fact]
    public async Task OtherExceptions_AreNotRetried()
    {
        var count = 0;
        var behavior = new RoomConcurrencyRetryBehavior<StringRoomCommand, string>();

        var act = () => behavior.Handle(new StringRoomCommand(), () => { count++; throw new InvalidOperationException("boom"); }, CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>();
        count.Should().Be(1);
    }

    [Fact]
    public void AllStateChangingCommands_AreMarkedAsRoomCommands()
    {
        new[]
        {
            typeof(JoinRoomCommand), typeof(StartGameCommand), typeof(ProcessActionCommand), typeof(RequestUndoCommand),
            typeof(ClearUndoRequestCommand), typeof(UndoActionCommand), typeof(ResolveShowdownCommand),
            typeof(RebuyCommand), typeof(DeclineRebuyCommand)
        }.Should().AllSatisfy(t => typeof(IRoomCommand).IsAssignableFrom(t).Should().BeTrue());
        typeof(IRoomCommand).IsAssignableFrom(typeof(CreateRoomCommand)).Should().BeFalse();
    }

    private sealed record StringRoomCommand : IRequest<string>, IRoomCommand;
}
