# Repository Guidelines

## Project Identity

This repository is an online multiplayer Agricola-lite implementation. The first version implements the core game loop for 2-6 players. Occupation cards and minor improvements are intentionally left as future-facing placeholders; their action spaces and interfaces may exist, but their card effects are not implemented yet.

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

Avoid hard-coded rule branches such as `if (cardId === "joinery")` when the behavior can be represented as configuration, trigger, or effect data.

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
- Players cannot join a normal room after the game has started, unless they are reconnecting as an existing non-departed player.
- When a player leaves an already-started normal room, they are treated as departed and cannot rejoin that ongoing room.
- Server startup loads SQLite room snapshots, deletes empty or `WAITING` snapshots, and restores recoverable non-ended rooms.
- Session recovery chooses the latest recoverable room for that user and ignores `GAME_END` rooms.
- The admin test room has id `admin-test`; only username `admin` can see and enter it.
- The admin test room can be restarted, manually advanced, accepts repeated worker placement, and allows manual resource/animal/begging adjustment for debugging.
- The admin test room is not saved as a normal room snapshot.

## Socket Contracts

Socket event names live in `src/shared/socketEvents.ts`; payload types live in `src/shared/types.ts`.

Important active events include:

- Auth and lobby: `REGISTER`, `LOGIN`, `RESTORE_SESSION`, `CREATE_ROOM`, `JOIN_ROOM`, `LEAVE_ROOM`, `ROOM_LIST`, `ROOM_LEFT`.
- Game: `START_GAME`, `PLACE_WORKER`, `SYNC_STATE`, `ACTION_NOTICE`.
- Harvest: `SUBMIT_HARVEST_FIELD`, `SUBMIT_HARVEST_FEEDING`, `SUBMIT_HARVEST_BREEDING`.
- Major improvements: `COOK_WITH_MAJOR_IMPROVEMENT`.
- Admin test room: `ADMIN_RESTART_TEST_ROOM`, `ADMIN_ADVANCE_ROUND`, `ADMIN_ADJUST_RESOURCE`.

Legacy or placeholder events such as `PLAY_OCCUPATION`, `PLAY_IMPROVEMENT`, `BUILD_ROOMS`, `BUILD_FENCES`, `RENOVATE`, and `FAMILY_GROWTH` are still present for compatibility and routing, but new UI should prefer the unified `PLACE_WORKER` flow when executing action spaces.

`SUBMIT_HARVEST_FEEDING` includes optional `harvestConversions` for manually selected harvest-time major improvement conversions such as joinery, pottery, and basketmaker workshop. These conversions must be chosen by the player during feeding; do not auto-apply them at harvest finish.

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
