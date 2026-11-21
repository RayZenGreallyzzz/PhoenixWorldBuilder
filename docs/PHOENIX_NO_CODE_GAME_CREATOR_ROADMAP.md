# Phoenix Engine — no-code game creator: design decisions (2026-11-21)

> **Status:** development plan, not completed functionality. Based on code in `phoenix-engine-0.1` (Android version 2.0). Android 2.0 has not yet been tested by the owner. Keep existing Builder/UV44 functionality and work on a separate branch.

## Product vision

**One Phoenix Builder on Android creates games without writing code:** single-player RPG, cooperative RPG, MMORPG, shooters, MOBA and games mixing their mechanics. Author the terrain, cities, buildings, dungeons, monsters, NPCs, vendors, quests, skills, weapons and rules visually. Press **PLAY** in the editor to test. Export **an independent APK for players**, without Builder tools. An online game additionally publishes its world/configuration to a separate hosted server.

## Core architecture

1. **Builder/Authoring** — terrain and structures, prefab/skill/HUD editors; future visual quest, dialogue, logic, inventory, trade, server and export panels.
2. **Game Project** — versioned declarative JSON/assets, schemas and migrations, no system-specific paths or secrets.
3. **Core / Events / Rules** — platform-neutral entity/component model, event dispatch, conditions and actions. No `eval`, no extra per-system `requestAnimationFrame`.
4. **Runtime** — combat, animation, navigation, NPC AI, skills and quests in PLAY. EDIT resources and locations must remain unchanged after testing.
5. **Game Player** — lean Android client with the project assets; no editor UI.
6. **Phoenix Network/Server** — replaceable network adapter, authenticated authoritative simulation, zones/instances, persistent databases, multiplayer trade and anti-cheat.
7. **Build service** — create signed per-game APK/AAB with unique package ID, icon, version, resource bundle and server address. The existing GitHub Action builds a **debug APK of Phoenix Builder**, not user-authored games.
8. **Payments adapter** — optional independent crypto-wallet/payment integration; never store user private keys in projects, game APKs or Builder.

## Actual baseline found in the 2.0 source

- `phoenix-core.js`: entities/components/snapshots and edit/play modes; live-edit is not an end-to-end working feature.
- `phoenix-ai.js`, `phoenix-prefabs.js`, `prefab-editor.js`: NPC/mob prefabs, waypoints, idle/patrol/chase/guard; this is a basic FSM, **not navmesh**.
- `phoenix-combat.js`, `phoenix-skills.js`, `phoenix-mob-features.js`: HP, attacks, MP, skill actions, mob settings and timed respawn. NPC skill casting has integration in `prefab-editor.js`.
- `phoenix-weapon.js`, `play-bridge.js`: prototype shooter fire/ammo/reload/aim; no full projectile/ballistics system, physical jump/crouch still TODO.
- `phoenix-skill-layout.js`: MOBA/MMORPG/shooter HUD presets; a preset does **not** equal a complete genre.
- `phoenix-animations.js`: clip mappings. **Death missing clip** needs safe fallback instead of showing a T-pose before mob disappearance.
- Current mobile scene has ~80-game-entity limit in editor code and a budgeted AI update; performance/scaling are future work.
- There is **no demonstrated online server, no-code quest editor, complete inventory/trade or user-game APK exporter** in the checked source.

## Visual rules and quests — first foundations

A designer links **Trigger → Conditions → Actions** through UI nodes, without scripts:
- Trigger: mob killed, item collected/crafted, NPC talked, area entered, boss defeated, quest completed, trade completed.
- Conditions: level, quest completion, flags/faction, inventory, time, party and permissions.
- Actions: increment objective, show dialogue, award XP/gold/items (via trusted subsystem), unlock gates/quests, spawn groups, change NPC/city/world state.
- Scope: personal, party, instance, global world. Online events are **verified by the server**.
- Event IDs are deduplicated; state is saved per player; no direct arbitrary JavaScript in project files.

First code in this development branch:
- `engine/core/phoenix-events.js` — validated portable events and subscriptions.
- `engine/core/phoenix-quests.js` — declarative quest catalog, requirements, goals, per-player progress, serialization, one-time claim *instructions*.
- `tests/test-phoenix-events-quests.cjs` — player isolation, event replay protection, quest prerequisites, claims and restores.

**Prototype boundary:** these modules are not yet wired into the Builder UI/PLAY nor capable of granting real items/money. On an online server, claims and inventory/currency transfers must be committed in one database transaction, with durable idempotency.

## No-code NPC, RPG, shooter, MOBA and MMO roadmap

- **NPC and world:** NPC roles (merchant/blacksmith/guard/quest giver), dialogue tree, schedules, patrol/guard/chase, respawn/loot, navigation/pathfinding, animations fallback, world flags.
- **RPG:** inventories, item ownership, equipment, crafting, XP/classes/levels, quest chains, shops, branching dialogs, individual/group/world story states.
- **Shooter:** configurable weapons, hits/projectiles/ADS/recoil, physics jump/crouch, server-side shooting validation.
- **MOBA:** heroes, team assignment, waves/lanes, towers, bases, timed matches, matchmaking, win conditions.
- **MMORPG:** authenticated accounts, independent character progression, server zones/shards, persistent world, groups/guilds, moderated chats, economy and data migrations.

## Online setup inside Builder

User selects Offline / Co-op / Persistent online / Online match. For online: choose **bring your own server** or **managed server** (future API), enter a secure address, check TLS/protocol compatibility, configure capacity, zones and backups. Never embed admin secrets/credentials in exported game files. Client sends inputs/intent; server validates kills, XP, quest progress, drop, ownership and trades. World updates can be published separately from APK **only if client/runtime compatibility permits**.

## Player-to-player trade and crypto payments

**In-game trade:** item ↔ item, item ↔ virtual coins, gifts, player shops, auctions, multiple virtual currencies and per-item flags (tradeable/bind). The authoritative server must lock inventory/coins, reset approvals when offers change, revalidate assets and finalize both legs **atomically**, with a durable audit trail and anti-dupe tests. P2P means *player-to-player*, not trusting clients.

**Real cryptocurrency:** per owner's decision, allow optional blockchain-based payments in future games. Keep crypto assets separate from normal game gold, XP and drops. No mandatory Phoenix-issued token and no mandatory NFT. Actual network, currency, wallet provider, eligible countries and business model are not yet selected.

- Wallet connection via reputable external/noncustodial provider; **never request seed phrases**.
- Show chain/token/amount/network fees and irreversible-transaction warning.
- Backend verifies recipient, token, chain, amount, order ID and sufficient confirmations; prevent replay/double-credit.
- For crypto ↔ in-game item P2P deals, a secure escrow/contract or reputable regulated intermediary may be required. A confirmed on-chain transfer and an off-chain item grant are **not automatically atomic**; failure/disputes require a separately designed process.
- Implement security reviews, jurisdiction-specific KYC/AML/sanctions/age/tax compliance where applicable. Enable financial functionality only when approved for target regions and distribution channel.
- **Google Play warning:** Google Play Billing generally applies to in-app digital goods/services; tokenized assets used to buy digital content are also addressed in Google's payments rules. Do not treat crypto as a workaround. The blockchain-content and wallet/exchange policies may also apply.
- Policy references: https://support.google.com/googleplay/android-developer/answer/9858738 ; https://support.google.com/googleplay/android-developer/answer/10281818 ; https://support.google.com/googleplay/android-developer/answer/13607354 ; https://support.google.com/googleplay/android-developer/answer/16329703 .

## Roadmap and first acceptance test

1. Owner verifies **2.0 APK on actual Android** (backup first): EDIT/PLAY, GLB persistence, mob animations, skills, death/no-Death fallback, respawn and performance.
2. Implement **events + quest-state kernel** and tests, then visual Quest/Logic Editor and connect to actual gameplay events.
3. Inventory/items/ownership/rewards and dialogue; first single-player complete quest.
4. Two-client server prototype, server-signed/trusted events, DB persistence, authenticated rewards.
5. Transactional in-game P2P trade, player shops and auctions.
6. Separate Game Player and automated, reproducible, signed **per-game APK/AAB**.
7. Managed/specified server deployment and hot world-data publish with migration and rollback.
8. Optional compliant **crypto payments** in a staged/test environment, later production.
9. MMO scaling and richer shooter/MOBA genre rules.

**Vertical slice:** village + hunter + 5 wolves + wolf skins + 500 virtual gold + 100 XP; two players progress independently; no repeated event/reward duplication, stored progress survives restart. A local trade with virtual gold follows. Real crypto comes only after payment/compliance design.
