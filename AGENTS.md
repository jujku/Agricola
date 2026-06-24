# Repository Guidelines

## Project Identity

This repository is an online multiplayer Agricola-lite implementation. The first version implements the core game loop for 2-6 players. The occupation and minor-improvement card feature must be built as data-driven cards with hands, played-card areas, costs, prerequisites, printed points, passing markers, structured triggers, reusable effect definitions, and engine-applied card effects. A card that can be dealt and played in the normal deck must have executable structured effects; unknown reference-only cards must remain explicit unplayable placeholders until enough rules text is known.

Keep the user-facing UI in Chinese. Use the established warm cartoon farm / tabletop board-game visual direction.

## Documentation Rule

Every code change must keep the Markdown docs in sync.

- Put project structure, architecture, development workflow, technical contracts, and agent instructions in `AGENTS.md`.
- Put game rules, card/action definitions, scoring rules, and player-count rule differences in `RULE.md`.
- When adding or changing a rule, action space, phase, socket contract, state shape, resource, asset convention, or persistence behavior, update the relevant Markdown in the same change.
- If implementation intentionally differs from `RULE.md`, treat that as a bug or explicitly document the temporary gap before moving on.

## Tech Stack

- Frontend: React, TypeScript, TailwindCSS, Zustand, Vite.
- Backend: Node.js, Express, Socket.IO.
- Database: SQLite.
- Tests: Vitest.

## Project Structure

- `src/client`: browser client.
- `src/client/ui`: React UI components.
- `src/client/store`: Zustand client state.
- `src/client/socket`: client socket bindings.
- `src/client/styles`: global CSS.
- `src/client/assets`: image and sprite assets.
- `src/client/assets/card-references`: reference-only card sheet assets used to transcribe minor improvement and occupation card data. Runtime card UI imports cropped assets instead of these reference sheets.
- `src/client/assets/minor-improvements`: cropped runtime art for implemented minor improvements. Filenames use `??-???.png` and stay in `RULE.md` order; `atlas.json` stores the trim metadata for each crop.
- `src/client/assets/occupations`: cropped runtime art for implemented occupations. Filenames use `??-???.png` and stay in `RULE.md` occupation order; `atlas.json` stores source-sheet, supplemental-art, trim, and row-order metadata.
- `src/config`: data-driven rule definitions, including base actions, round cards, player-count actions, major improvements, scoring, and capacity data.
- `src/engine`: pure game logic, including `GameEngine`, `RoundManager`, `ActionResolver`, `HarvestManager`, `ScoringManager`, `CardManager`, `AnimalManager`, and `FarmManager`.
- `src/state`: serializable game, player, farm, action-space, and card state.
- `src/shared`: socket events, shared payloads, and reusable contract types.
- `src/server`: Express/Socket.IO server, persistence, auth, room recovery, and network code.
- `scripts`: local maintenance or asset scripts.
- `data`: runtime SQLite data.
- `dist`, `.logs`, `node_modules`: generated/runtime output. Do not edit by hand.

Tests are colocated with implementation files using `*.test.ts`, for example `src/engine/GameEngine.test.ts`.

## Architecture Rules

The core state flow is:

`UI -> socket payload -> GameEngine / managers -> new GameState -> SYNC_STATE -> UI`

React components must not directly mutate game state. UI may collect input and preview legal choices, but final validation belongs in the engine. Shared contracts belong in `src/shared`; reusable game data belongs in `src/config`.

The game should be data-driven:

- Action spaces are configured with effects, costs, prerequisites, rules, restrictions, and player counts.
- Round cards are configured by season and shuffled within each season.
- Player-count action spaces are additive through `playerCounts`.
- Major improvements use configured triggers/effects rather than card-id-specific UI logic wherever possible.
- Minor improvements and occupations use shared card definition shapes. Put card names, fixed resource costs, dynamic resource costs, animal costs, prerequisite text, reusable prerequisite checks, printed victory points, passing behavior, minimum player counts, effect text, effect categories, implementation status, and executable structured effects in `src/config/minorImprovements.ts` and `src/config/occupations.ts`.
- Do not parse card costs or prerequisites from display strings. Use structured fields such as `cost`, `animalCost`, `scalingCost`, and typed `requirements`; keep `costText` and `prerequisiteText` as card-face/UI copy.
- Card play must go through `PLACE_WORKER` action effects (`playMinorImprovement` / `playOccupation`) so worker placement, costs, prerequisites, card movement, and follow-up actions are validated in the engine. Keep legacy `PLAY_OCCUPATION` / `PLAY_IMPROVEMENT` socket events as compatibility notices unless they are intentionally reworked.
- Avoid card-id-specific branches for minor/occupation behavior. Express card behavior as reusable effect categories, triggers, requirements, cost modifiers, capacity modifiers, scoring bonuses, or resolver paths that can serve multiple cards.
- Player hands are hidden UI state for other players. Server sync should reveal each socket user's own `occupationHand` and `minorImprovementHand`, while other players' hands are not rendered as inspectable card lists.
- Card draft is an optional room setting stored in `GameState.options.enableCardDraft`. When enabled, `START_GAME` enters `CARD_DRAFT` before round 1: each player has one current 7+7 draft pack, submits one minor and one occupation per draft round, then packs pass to the next player with the final player's pack wrapping to the first. `cardDraft.packs` must be redacted so each socket sees only its own current pack.
- Room creation should open a settings modal instead of exposing draft toggles inline. The create-room payload may carry a room password and a per-round draft time limit; `0` or empty means unlimited time. If a draft time limit is set, the server should auto-submit the current pack's first available minor improvement and occupation for players who have not submitted by timeout, then continue draft resolution normally.

Avoid hard-coded rule branches such as `if (cardId === "joinery")` when the behavior can be represented as configuration, trigger, or effect data.

Minor improvement and occupation implementation status is explicit:

- `implemented` means the engine applies the effect fully.
- `placeholder` means the card entry exists for deck completeness or reference tracking but must not be offered for normal play until enough text is known to make it understandable and executable.

Do not introduce playable `textOnly` cards. If a future card cannot be executed, keep it out of the normal deck as a placeholder and document the exact gap in `RULE.md` before exposing it.

Card effects are resolved through reusable trigger points:

- `onPlay` applies immediate resources, animals, bonus points, automatic plowing, free small pastures, scheduled goods, and card markers after costs and prerequisites succeed.
- `afterAction` applies card bonuses after a worker action resolves, including action-space bonuses for resources, animals, scheduled goods, resource transfers back onto accumulation spaces, actor-targeted rewards via `target: "actor"`, card-local stored goods, and actual card-triggered or action-space-triggered bake-bread resolution through `ActionInput.bake`.
- `afterAction` context includes the acting player's farm before and after the action plus the accumulated goods taken from the action space. Use this for new-pasture, accumulated-threshold, and return-to-space card effects rather than inferring from card ids.
- A card played during a worker action resolves its own `onPlay` immediately, but it must not retroactively trigger its own `afterAction` effects for that same worker action. `afterAction` should use the cards that were already in play at the start of the resolved action.
- Resource gain effects may scale through reusable definitions such as `gainResourcesByInventory`, `gainResourcesByAnimals`, `gainResourcesByRooms`, `gainResourcesByFamilyMembers`, `gainResourcesByFields`, `gainResourcesByPlayedCardCount`, `gainResourceUpTo`, condition-count threshold effects, and per-matching-player threshold effects for harvest cards.
- Mixed resource/animal effects that may include an optional resource cost or temporary family-member cost should use `gainGoods`; if animal storage cannot accept the animal, the engine must roll back the cost and reward for that effect.
- `returnHome` applies work-phase-end card rewards before occupied action spaces are cleared, so cards can inspect which spaces were used in the just-finished work phase.
- `roundStart` applies pending goods and conditional per-round rewards during round preparation.
- `harvest` applies field-stage and harvest-start card rewards before feeding and breeding.
- `scoring` adds card-based bonus points during final scoring.
- `costModifier`, `capacity`, and `actionRestriction` effects are consulted by build, renovate, fence, facility, housing, and animal-housing logic rather than being reimplemented in UI.
- Fixed room-cost modifiers are per-room structured costs. A modifier that only names the current room material changes only that material cost; shared build logic must multiply the per-room cost by the number of new rooms after applying the fixed rule.
- Room-count cost modifiers may scale by all current rooms (`discountByRooms`) or by the two printed starting-room positions only (`discountByInitialRooms`). Use the more precise scope instead of a hard-coded card check.
- `conversion` effects from occupations and minor improvements are exposed through the harvest feeding conversion input when the timing is compatible with feeding; they are player-selected conversions, not automatic resource drains. When one card has multiple conversion paths, `HarvestConversionInput.conversionId` must select the exact configured conversion effect.
- `actionAccess` effects are resolved by the engine through explicit action input flags such as `useCardActionAccess` and `usePendingActionAccess`. Free fence actions, occupied family-growth access, immediate newborn actions, double animal-market use, and one-time follow-up actions must remain engine-validated.
- `createActionSpace` effects add configured action spaces to `GameState.actionSpaces` with `ownerId`, `sourceCardId`, `visibility`, and optional `ownerPayment`. `visibility` controls who may use the space; `ownerId` is still retained for public spaces so owner payments can be transferred correctly.
- Conditions should remain reusable. Use `actionGroup`, `actionId`, `selectedEffectType`, `accumulatedTaken`, `actionOrdinalAtLeast`, `actionSpaceEmpty`, `actionSpacesOccupied`, `actionSpacesWithAccumulated`, `playersWithAnimalAtLeast`, `newPastureCreated`, `roundCardRevealed`, `bakeBreadUsed`, `fieldComposition`, `otherPlayerHasMore`, `ownedMajorImprovementCostAtLeast`, `uniquePlayerWithRoomsExactly`, `builtRoomsWithMaterial`, `renovatedFromTo`, `pasturesExactly`, and `actorPaidResources` for shared trigger checks instead of card-id branches.

When a card offers an optional benefit and the current UI has no dedicated choice prompt, the engine may apply the deterministic beneficial default described in `RULE.md`. Do not show user-facing copy that implies the effect is merely decorative. Card effects that require animal placement/cooking/discarding, plowing a field, building a stable, or choosing between building a room and renovating must create `GameState.pendingCardChoice` and wait for `SUBMIT_CARD_CHOICE` instead of silently choosing a farm space.

Card implementation should begin with code-level classification before writing resolver logic. Use these reusable buckets for minor improvements and occupations:

- Cost and prerequisite data: fixed resource costs, animal costs, per-family-member scaling costs, player-count gates, room-material gates, occupation-count gates, animal/resource thresholds, crop-field thresholds, round gates, and farm-layout gates.
- `onPlay` effects: immediate resource or animal gains, mixed goods, resource-up-to catch-up rewards, immediate bonus points, automatic plowing, automatic one-cell pasture creation, card-stored animals, and scheduling future goods.
- `returnHome` effects: work-phase-end rewards that inspect action-space occupation, action-space resources, or the acting order before workers return home.
- `roundStart` effects: fixed future-round goods, relative future-round goods, and conditional rewards checked at round preparation.
- `afterAction` effects: bonuses after specific action-space ids, action-space groups, accumulation spaces, building, renovation, fences, sowing, plowing, buying improvements, playing additional cards, automatic one-room build/renovation, free-reed renovation, and card-created stable construction.
- `harvest` effects: harvest-start rewards, field-stage rewards, feeding-stage conversions, and special breeding rules.
- `scoring` effects: minor printed points, occupation bonus points, card bonus points, room-material bonuses, animal/farm/layout bonuses, and play-order or play-round bonuses.
- `costModifier` effects: room-building, stable-building, fence-building, renovation, major-improvement, minor-improvement, and occupation-play discounts or substitutions, including discounts scaled by all rooms or by starting-room positions.
- `capacity` effects: extra housing, house-animal capacity, pasture capacity, card-stored animals, and external storage spaces.
- `conversion` effects: repeatable resource/animal conversions that are not tied to harvest feeding.
- `actionSpace` and `extraAction` effects: new private/public action spaces, worker-placement exceptions, adjacent/extra worker placement, and action availability overrides.
- `cardStorage` effects: goods or animals placed on a card, flipped or claimed later, and card-local counters/markers such as plow markers. If no UI prompt exists for a once-per-game claim, document and implement the deterministic timing in `RULE.md`.
- `passing` effects: cards that leave the current player's played area and enter the next player's hand after resolving costs and immediate effects.

Prefer shared predicates such as action-space group matching (`woodAccumulation`, `stoneAccumulation`, `animalMarket`, `lessons`, `renovation`, `roomBuild`, `fences`, `fieldActions`) over card-id checks. If a behavior truly needs a bespoke rule, document the reusable shape that would absorb the next similar card before adding the special case.

职业卡和小设施卡的开发顺序必须是：先确认卡牌所属的可复用分类，再补充结构化配置，最后接入通用 resolver。不要先写某张卡的专用分支。卡牌的中文名称、成本、前置、分数、传递和效果以 `RULE.md` 为准；英文原名只允许作为非展示 metadata。

The intended serializable card state is:

- `playedRound` for round-dependent scoring and schedule setup.
- `markers` for plow markers, food counters, goods stacks, flip-once flags, and use counters.
- `storedAnimals` and `storedGoods` for card-local capacity or goods that are not in the farm inventory.
- `bonusPoints` only for already-earned non-recomputable points; recomputable final scoring should stay in `scoring` effects.
- Pending round-start resources should stay in `PlayerState.pendingFood` and `PlayerState.pendingGoods`. The client should render them as compact per-round preview markers on the season card board and animate only resource icons, at the same icon size used by the resource panel, into the resource panel when the matching round card is revealed.

Work-phase action order is tracked in `GameState.workPhaseActionCount` and `GameState.lastActionOrdinalByPlayerId`. Reset both at round preparation. Use these fields for generic action-order card conditions instead of counting currently placed workers after the fact.

One-time card-granted follow-up actions live in `GameState.pendingActionAccess`. The UI may show and submit the pending action, but the engine is responsible for checking owner, round, adjacency rules when applicable, and whether the player still has an available worker.

Card-triggered farm/animal choices live in `GameState.pendingCardChoice`. The client should reuse the normal farm action overlay for those choices and submit the chosen `ActionInput` through `SUBMIT_CARD_CHOICE`. While a pending card choice exists, normal worker placement is blocked until the choice is resolved. Computer players must auto-submit conservative choices so rooms do not stall.

Keep all card-facing names and UI labels in Chinese. If the original English reference name is useful, store it as non-primary metadata such as `sourceName`; never make it the user-facing `name`.

Animal housing state is intentionally location-specific:

- `farm.animalHousing.house` stores the single animal allowed in the home area.
- `farm.animalHousing.stables` stores animals only for unfenced standalone stables.
- `farm.animalHousing.cells` stores animals placed in specific pasture cells, including animals that were in a standalone stable before that stable was fenced into a pasture.
- `farm.pastures[].animalType` and `animalCount` are derived pasture summaries. When changing fence or pasture logic, keep these summaries in sync with the location-specific housing data.

Major improvement scoring bonuses are shared between engine scoring and client previews through `src/shared/majorImprovementScoring.ts`. Do not duplicate workshop bonus calculations in UI-only code; realtime score, facility display, and final scoring should stay consistent.

## Current Server Behavior

- Normal rooms use numeric room ids.
- `WAITING` rooms are removed when empty.
- Games require 2-6 players to start.
- The first player in a waiting room is the host and is automatically ready. Only the host may start the game, and every player must be ready before a normal room can start.
- If the host leaves a waiting room, ownership transfers to the next remaining player and the new host is automatically marked ready.
- Waiting-room hosts may add computer players one at a time through `ADD_COMPUTER_PLAYER`. Computer players are persisted as `PlayerState.isComputer`, are automatically ready, count toward the 2-6 player limit, and are operated only by server-side AI rather than client sockets.
- Computer-player automation must keep the game flowing: submit draft picks, take conservative worker actions that require no unresolved UI choices, confirm harvest field/feeding/breeding stages, and continue scheduling after automatic phase advancement.
- Players cannot join a normal room after the game has started, unless they are reconnecting as an existing non-departed player.
- When a player leaves an already-started normal room, they are treated as departed and cannot rejoin that ongoing room.
- If player departures leave only one player in an active normal room, the remaining player wins immediately and the game enters `GAME_END`.
- `GAME_END` rooms track per-player settlement confirmations. When every remaining player confirms, the server clears timers, deletes the room snapshot, removes the room, and emits `ROOM_LEFT` to sockets still in that room.
- Server startup loads SQLite room snapshots, deletes empty or non-`GAME_END` normal-room snapshots, and only restores finished-room snapshots for persistence bookkeeping. Ongoing rooms are intentionally cleared on restart.
- Session recovery chooses the latest recoverable room for that user and ignores `GAME_END` rooms.
- The admin test room has id `admin-test`; only username `admin` can see and enter it.
- The admin test room can be restarted, manually advanced, forced into harvest, accepts repeated worker placement, and allows manual resource/animal/begging adjustment for debugging. Admin users can also toggle action-space occupancy directly from action-space cards to test occupation and minor-improvement effects that inspect occupied spaces. Non-admin test followers are auto-confirmed through harvest stages so the admin user does not get stuck waiting on a socketless test player.
- The admin test room is not saved as a normal room snapshot.

## Socket Contracts

Socket event names live in `src/shared/socketEvents.ts`; payload types live in `src/shared/types.ts`.

Important active events include:

- Auth and lobby: `REGISTER`, `LOGIN`, `RESTORE_SESSION`, `CREATE_ROOM`, `JOIN_ROOM`, `LEAVE_ROOM`, `ROOM_LIST`, `ROOM_LEFT`.
- Game: `ADD_COMPUTER_PLAYER`, `SET_PLAYER_READY`, `START_GAME`, `SUBMIT_CARD_DRAFT_PICK`, `SUBMIT_CARD_CHOICE`, `PLACE_WORKER`, `CONFIRM_GAME_END`, `SYNC_STATE`, `ACTION_NOTICE`.
- Harvest: `SUBMIT_HARVEST_FIELD`, `SUBMIT_HARVEST_FEEDING`, `SUBMIT_HARVEST_BREEDING`.
- Major improvements: `COOK_WITH_MAJOR_IMPROVEMENT`.
- Admin test room: `ADMIN_RESTART_TEST_ROOM`, `ADMIN_ADVANCE_ROUND`, `ADMIN_START_HARVEST`, `ADMIN_ADJUST_RESOURCE`, `ADMIN_ADD_CARD_TO_HAND`, `ADMIN_TOGGLE_ACTION_SPACE_OCCUPIED`.
- Admin test room also exposes a card-library helper for the admin user, letting them browse all implemented occupation and minor-improvement cards and add a chosen card directly to the test player's hand.

Legacy or placeholder events such as `PLAY_OCCUPATION`, `PLAY_IMPROVEMENT`, `BUILD_ROOMS`, `BUILD_FENCES`, `RENOVATE`, and `FAMILY_GROWTH` are still present for compatibility and routing, but new UI should prefer the unified `PLACE_WORKER` flow when executing action spaces.

Card-play action inputs may include `occupationCardId` or `minorImprovementCardId`. These ids are only commands to the engine; the server must validate that the acting player actually has the card in hand, can pay its configured cost, and satisfies implemented prerequisites.

`SUBMIT_CARD_DRAFT_PICK` includes one `minorImprovementId` and one `occupationId`. The server must validate that both cards are in the submitting player's current redacted draft pack and that the socket user matches `playerId`; when all players have submitted, the engine moves selected cards into each player's hidden hands and rotates the remaining packs.

`SUBMIT_CARD_CHOICE` includes `roomId`, `playerId`, and an `ActionInput`. It resolves the current `GameState.pendingCardChoice` for that player. Animal choices use `animalPlacement`; plowing uses `fieldCell`; card-created stable construction uses `stableCells`; build-room-or-renovate choices use either `roomCells` or `selectedEffectTypes: ["renovate"]`.

Card-triggered bake-bread opportunities, such as 打谷板、面包铲、烤炉童工, use the same `ActionInput.bake` payload as normal bake-bread action spaces. The engine must validate that the player owns the chosen baking major improvement and has enough grain; the UI may only collect the choice.

`SUBMIT_HARVEST_FEEDING` includes optional `harvestConversions` for manually selected harvest-time conversions from major improvements, occupations, and minor improvements. Use `conversionId` when a card has multiple conversion options. These conversions must be chosen by the player during feeding; do not auto-apply them at harvest finish.

Major improvement cooking payloads may include `cookedItems` for non-animal cook targets such as vegetables. Keep `cookedAnimals` for animal-only compatibility, but use `cookedItems` when a specific major improvement should cook vegetables through the same socket/engine path.

## Build, Test, and Development Commands

- `npm run dev`: start the Vite client on all interfaces.
- `npm run server`: run the TypeScript server in watch mode with `tsx`.
- `npm start`: run the server once from `src/server/index.ts`.
- `npm run build`: type-check with `tsc --noEmit`, then build the Vite app.
- `npm run preview`: serve the production build locally.
- `npm run check`: run TypeScript checking only.
- `npm test`: run Vitest once.

Run `npm install` after changing dependencies in `package.json`.

Do not start the dev server unless the user asks for it. The user often restarts the service manually.

## Coding Style

Use strict TypeScript and ES modules. Match existing formatting:

- Two-space indentation.
- Double quotes.
- Semicolons.
- Named exports for most modules.
- React components use PascalCase filenames and exports, such as `Board.tsx`.
- Utility, state, config, and manager modules use descriptive camelCase or PascalCase based on exported type/class names.

There is no lint script configured, so `npm run check`, `npm test`, and focused review are the current guardrails.

## CSS And UI Conventions

Global modal styling uses `.game-modal` as the base class. When a specific modal needs a different width or layout, use a combined selector such as `.game-modal.major-facility-modal` instead of only `.major-facility-modal`; otherwise the later base `.game-modal` rule may override the specialized width.

Avoid card-internal scrollbars for core game cards when the layout can be solved with modal width, grid sizing, or clearer content wrapping.

Major facility cards should keep a fixed shared width and height across all ten slots, including purchased placeholders, and the card grid should sit centered in the modal. Prefer compact icon rules and grouped labels over repeated explanatory text, but preserve every functional rule needed to understand cost, victory points, conversions, harvest effects, and end-game bonuses. Do not make bordered labels, buttons, or button-like controls feel cramped: keep readable icon sizes and enough padding between text/icons and borders.

Major facility art uses `src/client/assets/sprites/major-facilities.png` as the source sprite sheet. Cropped card artwork lives in `src/client/assets/major-facilities/` with `atlas.json` metadata from TexturePacker-style alpha trimming; `card-background.png` is the shared art-slot background, and the individual facility PNGs are layered above it in the card art frame.

Small improvement art uses `src/client/assets/minor-improvements/`, and occupation art uses `src/client/assets/occupations/`, with the same formal card-face treatment. Keep filenames aligned to the matching `RULE.md` card order. If the visual-order correction changes, update the atlas metadata in the same change. Occupation character crops stay transparent and are layered over `card-background-grass-sky.png`, the shared grass-and-sky art-frame background. Formal small-improvement and occupation card faces should keep one fixed width, height, and internal proportion across draft, hand, play-selection, and card-detail modal areas on the same device; surrounding grids may scroll or wrap but must not stretch or compact the card face. Card faces should keep the full cropped illustration visible with proportional scaling and a consistent art safe area; the shared art background may overfill the frame and be clipped. Small-improvement costs should prefer structured resource or animal icons over cost prose where the configuration provides typed costs, and cost/prerequisite rows should keep a fixed shared height with compact labels and centered content.

Played occupation and minor-improvement cards are public and should render in the viewed player's farm/resource area below the large-facility block as compact summary chips, similar to owned major-facility entries. Clicking a chip should open a modal with the formal full card face. The hidden hand modal should show only the current user's hand, not the already-played cards.

Scoring guidance should be available inline near the game header rather than hidden in a modal, but it should be collapsed by default to avoid occupying board space. The collapsed state should clearly identify it as scoring guidance; expanding it should show each scoring item with its icon, quantity or range, and the corresponding victory points, and allow collapsing again.

Independent `chooseAny` action spaces that can execute multiple sub-actions without prerequisites should use per-sub-action confirmation in the UI. Confirmed sub-actions should be locked against repeat selection, while the main action button ends the whole action and submits the confirmed sub-actions together. Do not use this pattern for `chooseOne` spaces or prerequisite chains such as renovation before fences or family growth before minor improvements.

Action-space cards should use normalized descriptions: `chooseOne` as “N选一”, independent `chooseAny` as “可多选”, and prerequisite chains as “前置行动后可后续行动”. Accumulation spaces should continue to show their accumulated resource type after being emptied, with the count shown as 0 until the next replenish.

Fence placement should not show solid fence marks for unbuilt edges. Use hover-only ghost hints for buildable unselected edges, a clearly solid selected state before confirmation, and a distinct solid placed state after construction.

## Testing Guidelines

Add or update colocated `*.test.ts` files when changing engine, server, shared contracts, persistence, or scoring behavior.

Prefer deterministic tests around:

- Game state transitions.
- Action effect resolution.
- Resource and animal accounting.
- Round deck and harvest progression.
- Farm layout, room, field, stable, fence, pasture, and animal placement rules.
- Harvest field/feeding/breeding submissions.
- Major improvement purchase, baking, cooking, and scoring bonuses.
- Room recovery and socket edge cases.

Run `npm run check` and `npm test` before handing off. Run `npm run build` when changes touch client rendering, server startup, bundling, or shared types.

## Commit Guidelines

Recent commits use concise imperative subjects, sometimes with Conventional Commit prefixes such as `fix:` and `feat:`.

Examples:

- `fix: align scoring totals`
- `feat: add room recovery flow`

Before committing, inspect the diff and avoid including unrelated generated output.
