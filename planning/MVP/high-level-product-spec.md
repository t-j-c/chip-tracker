## High-Level Product Specification: ChipTrack MVP

**Target Release:** MVP 1.0

---



### 1. Executive Summary



ChipTrack (working title) is a lightweight utility application designed to replace physical poker chips. It allows in-person players who have a physical deck of cards to manage a fully functional poker game directly from their phones. By handling the complex math of pot sizes, betting structures, and blind rotations, ChipTrack removes the friction of playing spontaneous poker games while preserving the tactile joy of physical cards.



### 2. Target Audience & Problem Statement



**The Problem:** Friends want to play poker but only have a deck of cards. Keeping track of written chip counts on paper is tedious, error-prone, and ruins the pace of the game.

**The Audience:** Casual poker players and friends hanging out in person (initially targeting 2-player, heads-up scenarios).

**The Solution:** A synchronized, zero-setup mobile interface that tracks stacks, manages the pot, enforces rules, and rotates dealer buttons over a local network.



### 3. MVP Scope & Objectives



To validate the core loop with minimal engineering effort, the MVP is strictly bounded:



* **Two Players Only (Heads-Up):** Eliminates complex side-pot logic and multi-way action edge cases.

* **Local Network Only:** Players must be on the same WiFi/network. This defers the cost and complexity of cloud infrastructure, user authentication, and web-based link sharing.

* **No Card Mechanics:** The app remains completely agnostic to the physical cards. It is purely an accounting and state-management tool.



### 4. Core User Journeys



#### Journey 1: Game Creation & Connection



* **Player A (Host):** Opens the app, taps "Host Game," and inputs the starting parameters (Starting Stack size, Small Blind, Big Blind).

* **Player B (Joiner):** Opens the app, taps "Join Game," and selects Player A's locally broadcasted game.

* **Outcome:** Both devices lock into the same synchronized game state, ready for Hand 1.



#### Journey 2: Playing a Hand



* **Pre-flop:** The app automatically assigns the Dealer button, posts the Small Blind and Big Blind from the respective players' stacks, and prompts the Small Blind to act first.

* **Action Flow:** Players tap buttons on their screens to act (Fold, Check, Call, Bet/Raise). The app restricts invalid actions (e.g., hiding the "Check" button facing a bet).

* **Street Progression:** When betting is equalized, the app prompts users to advance to the next street (Flop, Turn, River) or proceed to Showdown.



#### Journey 3: Awarding the Pot



* **By Fold:** If Player A folds, the app instantly awards the pot to Player B and resets for the next hand.

* **By Showdown:** If both players check the River or call the final bet, the app presents an "Award Pot" screen. Because the app does not know the cards, players must manually select the winner (Player A, Player B, or Split Pot).

* **Next Hand:** The app automatically rotates the Dealer button and posts the new blinds.



---



### 5. Feature Requirements



| Feature Category | Business Requirement |
| --- | --- |
| **Connectivity** | Local network discovery (auto-detect host on the same WiFi). No account creation required. |
| **Game Setup** | Configurable Starting Stacks, Small Blind, and Big Blind amounts prior to launch. |
| **State Management** | Automatic tracking of total pot, current bet to call, individual chip stacks, and dealer position. |
| **Heads-Up Logic** | Strict adherence to heads-up poker rules (Dealer = Small Blind, acts first pre-flop, last post-flop). |
| **Betting Controls** | Clear buttons for Fold, Check, Call, and a numeric input/slider for Raise amounts. |
| **Pot Resolution** | Manual pot awarding at showdown (Player A wins, Player B wins, or Split). |



---



### 6. Out of Scope for MVP (Future Roadmap)



* Online multiplayer via the internet or shareable invite links.

* Games with 3 or more players.

* Side pot calculations.

* Blind schedules (e.g., blinds increasing every 15 minutes for tournament play).

* Hand history logs and undo functionality.

* Custom avatars, profiles, or leaderboards.



### 7. Success Metrics



For the MVP, we will measure product-market fit and usability through:



1. **Completion Rate:** Percentage of created games that complete at least 10 hands (indicates the UI is frictionless enough to sustain gameplay).

2. **Session Length:** Average time spent in an active game state.

3. **Fatal Errors:** Rate of games abandoned due to desync issues on the local network.