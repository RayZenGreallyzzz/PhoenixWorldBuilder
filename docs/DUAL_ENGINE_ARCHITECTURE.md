# Phoenix Builder — dual-engine target architecture
Date: 2026-10-31
Status: design decision + validation plan; NOT implemented yet

## Goal
One offline Android **Phoenix Builder** application. Two isolated workspaces, not two rendering engines acting on the same WebGL canvas.

- **Three.js / Module Workshop**: base implementation `RayZenGreallyzzz/QDQR` (`src/wallSnap.js`, `src/meshOps.js`, `src/openingOps.js`, `src/surfaceOps.js`, `src/assemblyOps.js`). Edit/create modules, UV/PBR materials, image decals, independent X/Y/Z dimensions, bend/cut, booleans when appropriate, assembly, preview, GLB export, semantic geometry sockets.
- **Babylon.js / Construction Workspace**: create/edit buildings, terrain placement, foundations, floors, wall/roof/corner joints, ghost placement and collision visualization, avatar/drone building, Undo/Redo, project save/load, finished-building export for Godot.
- Existing Builder FIX remains intact until every pilot acceptance test succeeds. Current installed `com.phoenix.worldbuilder.legacytest` is NOT to be overwritten. Current `stabilize/phoenix-builder-fix-20261031` branch is the work area, not the installed app.

This supersedes the earlier proposed mapping (Three.js main construction / Babylon.js separate mesh editor); because QDQR already provides functioning Three.js module-editing code, **this mapping minimizes workshop reimplementation**. It DOES NOT eliminate the need to adapt the Builder runtime, which currently uses Three.js r140 and would need a new Babylon construction workspace.

## Runtime boundary
UI shell controls route `workshop` versus `construction`; only the active route owns GPU scene, canvas, render loop, camera, input, texture/GPU allocations. On route switch: persist in-flight changes, export/import data as needed, call renderer/engine disposal + texture/geometry cleanup. Do not render the same shared WebGL scene from both engines. Babylon libraries and GLB codecs must be packed locally; **offline** means no dynamic dependence on CDN.

## Data boundary: module package
A module consists of:
- `module.glb`: static geometry, original PBR/UV/texture images, hierarchy where needed. Do not assume a Three.js shader patch exports through GLB.
- `module.json`: stable `moduleId`, `revision`, `kind`, pivot convention, canonical meters, exact width/height/depth/wallThickness, `sockets[]` (position, outward normal, width/thickness, role, occupied state derived from scene), face/material references, optional collision hints. Coordinates always documented as **local, Y-up, right-handed**.
- Optional packed archive/project manifest for transport and native storage; avoid re-importing/duplicating full GLB bytes per instance.
- A building project uses `building.json` with schema version, module asset references, instance IDs, parent floor, transforms (position/rotation/scale), terrain and floor elevations, render visibility, scene revision, and journal/checkpoints.
- Distinguish authoring assets from instances: mesh modifications create a new module revision, not a silent mutation of all existing houses; offer explicit update of instances.

## Coordinate & material interoperability
Three.js uses a right-handed Y-up scene; GLB/glTF assets are right-handed Y-up. Set Babylon construction scene `scene.useRightHandedSystem=true` **before** GLB loading (otherwise Babylon's loader adds a handedness conversion root). Keep root transform and socket transforms consistent; compute sockets from saved local points using the loaded module world matrix. Verify local -> GLB -> Babylon -> save -> open -> Three round trips including asymmetric/rotated curved walls.
Standard glTF PBR is interchange. Babylon cannot automatically reproduce custom Three.js `onBeforeCompile` shader tricks from Builder FIX; texture projection must be baked into UV/texture or represented as editable shared material/project metadata before GLB export. Validate transparency and double-sidedness.
GLB alone is not authoritative for snap metadata; sidecar manifest is.

## Why not copy and paste
QDQR: Three.js **0.186.1**, ESM, Vite/Capacitor 8; Builder FIX: Three.js **r140**, global scripts, Android WebView. Babylon is not presently the construction engine. Directly combining JS files or expecting a common scene object would create compatibility/serialization bugs; keep an adapter and tests.

## Pilot deliverable — no Big Rewrite
1. Create **parallel** experimental build with separate application ID distinct from `.legacytest`, keep installed stable FIX.
2. Build native app shell switch, Three.js workshop editor reusing *tested* QDQR functionality, Babylon.js construction prototype. First demonstration: editable plain textured straight wall and one rounded wall.
3. Export both as GLB + sidecar; close Three render context, import into Babylon and connect with sockets. Confirm zero visual seam/overlap and alignment after rotation/scale.
4. Two floors, four walls, one opening, roof, continuous wall image; edit a module in Three and return to Babylon without losing instance transforms.
5. Save building, close app, reopen offline: identical scene and materials; export assembled house GLB to Godot; ensure no terrain/avatar are accidentally embedded.
6. Regression tests on both sides: world/local coordinates; socket angle/normals and occupied socket; mesh revision; textures; CSG opening; bounds; undo/redo; persistence. Real-device Android acceptance on 4GB Mali-G52; target reasonable working memory and FPS, not a presumed guaranteed figure.

## Failure modes / gates
- Babylon engine creation or switch causes WebGL context loss -> dispose, fallback to current stable Three builder.
- Round-trip pivots or handedness incorrect -> do not migrate.
- Custom texture projection lost -> no export claim; write an explicit baking step first.
- Bundle size/memory > tested Android budget -> defer Babylon integration; improve existing Three snap instead.
- Do not merge experimental prototype into main before all above tests pass.

## Source references
- QDQR: https://github.com/RayZenGreallyzzz/QDQR
- Builder FIX: https://github.com/RayZenGreallyzzz/PhoenixWorldBuilder/tree/fix/legacy-editor-simplify-surfaces-20261022
- Existing comparative audit: docs/WORKSHOP_PARITY_AUDIT.md
- Three.js glTF export: https://threejs.org/docs/pages/GLTFExporter.html
- Babylon loaders: https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/importers/loadingFileTypes.md
- Babylon glTF coordinate notes: https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/importers/glTF.md
