using ChipTracker.Application.DTOs;
using ChipTracker.Domain.Entities;
using ChipTracker.Domain.Engine;
using ChipTracker.Domain.Enums;
using FluentAssertions;

namespace ChipTracker.Application.Tests;

/// <summary>
/// Tests for GameStateDto.MapFromDomain with activity log mapping.
/// </summary>
public class GameStateDtoTests
{
    private static List<Player> TwoPlayers(int stack1 = 1000, int stack2 = 1000) =>
    [
        new() { PlayerId = "p1", Name = "Alice", Stack = stack1 },
        new() { PlayerId = "p2", Name = "Bob",   Stack = stack2 }
    ];

    private static ActionRequest Action(string playerId, PokerAction action, int? amount = null) =>
        new() { PlayerId = playerId, Action = action, Amount = amount };

    [Fact]
    public void MapFromDomain_GameRoom_PopulatesRecentActivity()
    {
        // Arrange
        var room = new GameRoom { GameState = GameEngine.CreateInitialState(TwoPlayers(), smallBlind: 10, bigBlind: 20, dealerIndex: 0) };
        room.PushState();

        // Perform an action to create more activity entries
        var state = GameEngine.ValidateAction(room.GameState, Action("p1", PokerAction.Call)).Value!;
        room.PushState(state);

        // Act
        var dto = GameStateDto.MapFromDomain(room);

        // Assert
        dto.RecentActivity.Should().NotBeEmpty("Should have recent activity entries");
        dto.RecentActivity.Should().AllSatisfy(e =>
        {
            e.Sequence.Should().BeGreaterThan(0, "Entries should have sequence numbers");
            e.EntryType.Should().NotBe(null, "Entries should have types");
        });
        
        // Verify it includes the last ~20 entries (or all if fewer than 20)
        var expectedCount = Math.Min(20, room.ActivityLog.Count);
        dto.RecentActivity.Count.Should().Be(expectedCount, "Should include up to 20 most recent entries");
        
        // Verify it includes the most recent entries (by sequence)
        var lastSequenceInActivity = room.ActivityLog.Last().Sequence;
        var lastSequenceInDto = dto.RecentActivity.Last().Sequence;
        lastSequenceInDto.Should().Be(lastSequenceInActivity, "Should include the most recent entry");
    }

    [Fact]
    public void MapFromDomain_IncludesNewActivityFields()
    {
        // Arrange
        var room = new GameRoom { GameState = GameEngine.CreateInitialState(TwoPlayers(), smallBlind: 10, bigBlind: 20, dealerIndex: 0) };
        room.PushState();

        // Act
        var dto = GameStateDto.MapFromDomain(room);

        // Assert
        dto.RecentActivity.Should().NotBeEmpty();
        
        // Verify that new fields are present
        // All entries should have Phase and HandNumber stamped
        dto.RecentActivity.Should().AllSatisfy(entry =>
        {
            entry.Phase.Should().NotBeNull("Phase should be stamped from domain");
            entry.HandNumber.Should().BeGreaterThan(0, "HandNumber should be stamped from domain");
        });
        
        // Verify that entries with PlayerId have PlayerName stamped
        var playerActionEntries = dto.RecentActivity.Where(e => e.PlayerId != null).ToList();
        playerActionEntries.Should().NotBeEmpty();
        playerActionEntries.Should().AllSatisfy(e =>
            e.PlayerName.Should().NotBeNull("PlayerName should be stamped for entries with PlayerId")
        );
        
        // Verify that BlindPosted entries have BlindType set
        var blindEntries = dto.RecentActivity.Where(e => e.EntryType == ActivityEntryType.BlindPosted).ToList();
        blindEntries.Should().NotBeEmpty();
        blindEntries.Should().AllSatisfy(e =>
            e.BlindType.Should().NotBeNull("BlindType should be set for BlindPosted entries")
        );
    }

    [Fact]
    public void MapFromDomain_GameStateOverload_DoesNotIncludeActivity()
    {
        // Arrange
        var room = new GameRoom { GameState = GameEngine.CreateInitialState(TwoPlayers(), smallBlind: 10, bigBlind: 20, dealerIndex: 0) };
        room.PushState();

        // Act - using the single-parameter overload
        var dto = GameStateDto.MapFromDomain(room.CurrentState!);

        // Assert
        dto.RecentActivity.Should().BeEmpty("The GameState overload should not populate RecentActivity");
    }
}
