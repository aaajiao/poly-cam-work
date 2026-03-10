# Intro Preset Authoring Spec

> Status: Draft
> Date: 2026-03-10
> Purpose: Turn the intro preset idea into an implementation-ready spec aligned with the current codebase.

---

## 0. One-Sentence Definition

Intro Preset is a separately stored, author-captured homepage entry state for one scene release.

It is:

- a frozen authored state
- stored as its own JSON asset in Blob
- loaded only for visitor entry
- version-bound to the published scene release

It is not:

- part of `SceneDraft.annotations`
- part of `ScanMetadata`
- a timeline recording system
- an automatic camera director

---

## 1. Product Decision

We do not build a full recorded opening timeline.

We build a single authored opening tableau:

1. editor logs in
2. editor adjusts camera, view mode, scan progress, and panel state
3. editor clicks `Capture Intro`
4. system serializes the current runtime state into a dedicated JSON file
5. visitor loads the scene and sees that state first
6. visitor clicks `Continue Scan` to resume from the captured scan state

This is the smallest implementation that preserves curatorial intent while fitting the current architecture.

Important clarification:

- the capture of this "best keyframe" or opening state only exists after login
- it is an authenticated authoring action, not a visitor-side capability
- before login, the system may only consume an already-published intro preset; it must not create or overwrite one

---

## 2. Why The Previous Draft Still Felt Unclear

The previous version already defined the data and the storage strategy well.

What was still ambiguous was the technical ownership split.

It mixed four different concerns in one flow:

1. domain data shape
2. Blob persistence
3. runtime restoration
4. UI entry points

For implementation, these must be separated explicitly.

---

## 3. Core Architecture Decision

### 3.1 Intro Preset is not a Hook

`IntroPreset` itself is a domain object and a persisted asset.

It belongs to:

- type definitions
- API handlers
- Blob path conventions
- publish/release versioning

### 3.2 Intro Preset runtime orchestration should use Hooks

The current system already uses hooks to orchestrate viewer-side behavior:

- `src/hooks/useScanEngine.ts`
- `src/hooks/useScanAnnotationTrigger.ts`
- `src/hooks/usePLYLoader.ts`

So the runtime layer for intro preset should also be hook-driven.

Specifically, hooks are the right place for:

- capturing the current camera + store state
- applying preset state after scene mount and camera reset
- resuming scan from a frozen preset state
- coordinating R3F lifecycle with Zustand stores

### 3.3 Final split

Use this split and do not collapse these responsibilities together:

```text
IntroPreset type/schema           -> domain layer
intro blob read/write/versioning  -> API + persistence layer
capture/apply/resume logic        -> hooks + store actions
buttons / CTA / editor affordance -> UI layer
```

---

## 4. Existing Code Anchors

This spec must map onto the current codebase, not invent a parallel system.

### 4.1 Stores

- `src/store/scanStore.ts`
  - owns `isScanning`, `scanPhase`, `scanT`, `scanRadius`, `scanOrigin`, `maxRadius`, `duration`, `triggeredAnnotationIds`, `activeAnnotationId`
  - currently exposes `startScan()`, `stopScan()`, `resetScan()`, `setScanProgress()`, `triggerAnnotation()`, `setActiveAnnotation()`

- `src/store/viewerStore.ts`
  - owns `viewMode`, `selectedAnnotationId`, `openAnnotationPanelIds`, `presentationMode`, `isAuthenticated`, `cloudScenesLoaded`
  - already contains the publish/draft loading chain and scene boot behavior

### 4.2 Viewer lifecycle

- `src/components/viewer/SceneCanvas.tsx`
  - `CameraController` resets the camera on scene change
  - `sceneReady` is currently gated by `cloudScenesLoaded`
  - `ScanOrchestrator` only mounts when `isScanning === true`
  - normal viewers mount only when `isScanning === false`

This matters because a paused partial scan cannot be restored correctly by only writing store state. The rendering path must also support a non-running but already-revealed scan snapshot.

### 4.3 Scan runtime

- `src/components/viewer/ScanOrchestrator.tsx`
- `src/hooks/useScanEngine.ts`
- `src/hooks/useScanAnnotationTrigger.ts`

These files already form the scan orchestration layer. Intro preset should extend this layer, not bypass it.

### 4.4 App boot and release loading

- `src/App.tsx`
  - refreshes auth session
  - loads cloud scenes
  - loads draft/release for the active scene

Intro preset loading should attach to the same active-scene boot path.

### 4.5 Publish chain

- `src/lib/publishApi.ts`
- `api/draft/[sceneId].ts`
- `api/release/[sceneId].ts`
- `api/publish/[sceneId].ts`

Intro preset versioning must plug into the existing publish flow rather than inventing a separate publish pipeline.

---

## 5. Scope And Non-Goals

### 5.1 In scope for MVP

- separate intro preset JSON asset
- intro draft + intro release Blob storage
- authenticated author can capture current intro state
- publish copies intro draft into the matching release version
- visitor loads the matching intro preset for the live release
- visitor sees `Continue Scan`
- scan resumes from the preset state instead of restarting from 0

### 5.2 Explicitly out of scope

- timeline recording
- keyframe playback
- automatic best camera framing
- multi-node auto-directed story chains
- separate intro version pointer independent from main release
- multiple intro presets per scene
- device-specific intro variants

---

## 6. Blob Contract

### 6.1 Paths

```text
scenes/{sceneId}/draft.json
scenes/{sceneId}/releases/{version}.json
scenes/{sceneId}/live.json

scenes/{sceneId}/intro/draft.json
scenes/{sceneId}/intro/releases/{version}.json
```

### 6.2 Version rule

There is no `scenes/{sceneId}/intro/live.json`.

The intro preset version is always derived from the main scene live version.

Visitor load contract:

1. read `scenes/{sceneId}/live.json`
2. resolve `version = N`
3. read `scenes/{sceneId}/releases/{N}.json`
4. read `scenes/{sceneId}/intro/releases/{N}.json`
5. if intro release does not exist, fall back to default viewer

### 6.3 Publish contract

When publishing scene release `N`:

1. write `scenes/{sceneId}/releases/{N}.json`
2. copy current `scenes/{sceneId}/intro/draft.json` to `scenes/{sceneId}/intro/releases/{N}.json` if it exists
3. update `scenes/{sceneId}/live.json` to `N`

This guarantees the content release and intro entry state cannot drift apart.

---

## 7. Data Model

### 7.1 Canonical type

```ts
export interface IntroPreset {
  version: 1

  sceneId: string
  enabled: boolean

  camera: {
    position: [number, number, number]
    target: [number, number, number]
    fov?: number
  }

  viewer: {
    viewMode: 'mesh' | 'pointcloud' | 'both'
  }

  scan: {
    progress: number
    radius: number
    phase: 'origin' | 'expansion' | 'complete'
    origin: [number, number, number]
    maxRadius: number
    duration: number
  }

  annotations: {
    openIds: string[]
    triggeredIds: string[]
    activeId: string | null
  }

  ui: {
    ctaLabel?: string
  }

  createdAt: number
  updatedAt: number
}
```

### 7.2 Required invariants

- `sceneId` must match the route scene id
- `scan.progress` is normalized `0..1`
- `scan.radius` is stored in addition to `scan.progress`
- `annotations.activeId` must either be `null` or appear in `triggeredIds`
- `annotations.openIds` should be a subset of triggered annotation ids for MVP

### 7.3 Why store both `progress` and `radius`

- `progress` is needed for resume semantics and CTA logic
- `radius` is needed to restore the visible reveal state immediately

Do not derive one from the other at load time.

---

## 8. Responsibility Split

This section is the execution contract.

### 8.1 Domain layer

Owns the shape and serialization of intro preset.

Primary file:

- `src/types/index.ts`

Add:

- `IntroPreset`

Optional helpers if needed:

- normalize/validate intro preset payload

### 8.2 Persistence layer

Owns Blob paths and HTTP read/write behavior.

Primary files:

- `api/intro/[sceneId].ts` (new)
- `api/publish/[sceneId].ts`
- `src/lib/publishApi.ts` or `src/lib/introApi.ts`

Required behavior:

- authenticated `GET /api/intro/:sceneId` returns intro draft
- authenticated `PUT /api/intro/:sceneId` writes intro draft
- public `GET /api/intro/:sceneId?version=N` returns intro release `N`
- publish copies intro draft into intro release `N`

### 8.3 Runtime store layer

Owns scan-state semantics, not network persistence.

Primary file:

- `src/store/scanStore.ts`

Required additions:

- `pauseScan()`
- `applyIntroScanSnapshot(preset: IntroPreset)`
- `resumeScanFromPreset(preset: IntroPreset)`

Semantics:

- `pauseScan()` freezes current scan state without clearing progress or triggered ids
- `applyIntroScanSnapshot()` restores the frozen visible state but does not start time progression
- `resumeScanFromPreset()` continues from the saved progress instead of resetting to 0

Important: the existing `stopScan()` currently clears progress and triggered ids. That behavior should remain destructive and should not be reused for intro capture or intro apply.

### 8.4 Runtime hook layer

Owns orchestration across camera, R3F lifecycle, and stores.

Recommended hooks:

- `useCaptureIntroPreset()`
- `useIntroPresetLoader(sceneId, version)`
- `useApplyIntroPreset()`

Responsibilities:

- `useCaptureIntroPreset()` reads camera + controls target + store state and produces an `IntroPreset`
- `useIntroPresetLoader()` loads the matching intro release for the active scene and live version
- `useApplyIntroPreset()` runs after scene mount and after default camera reset, then applies camera, view mode, scan snapshot, and panel state in the correct order

### 8.5 UI layer

Owns buttons and visitor CTA.

Likely files:

- toolbar or sidebar controls for authoring
- presentation overlay for visitor CTA

Required controls:

- authenticated editor: `Capture Intro`, `Clear Intro`
- visitor: `Continue Scan`

---

## 9. Hook Strategy

Yes, hooks are the right structure here, but only for runtime orchestration.

### 9.1 Why hooks fit this system

Because the current system already expresses viewer behavior through hooks plus store subscriptions:

- per-frame scan progression uses `useFrame`
- scan side effects subscribe to Zustand state
- viewer mount order matters
- camera access requires R3F context

Intro preset has exactly the same constraints.

### 9.2 What must not become a hook

Do not hide persistence or versioning inside runtime hooks.

These stay outside hooks:

- Blob path conventions
- release copying
- request/response schemas
- release/version coupling

### 9.3 Runtime sequence constraint

`useApplyIntroPreset()` cannot simply run on first render.

It must wait for:

1. active scene resolved
2. scene assets mounted
3. default `CameraController` reset completed
4. intro release payload available

Only then should it apply:

1. camera position + target
2. `viewMode`
3. scan snapshot
4. annotation focus/panel state

---

## 10. Critical Rendering Decision

This is the most important technical clarification in the document.

### 10.1 Problem

Current rendering only mounts scan reveal viewers when `isScanning === true` in `src/components/viewer/SceneCanvas.tsx`.

That means a visitor cannot see a paused partial reveal while the scan is not actively running.

### 10.2 Required change

We need a rendering state that supports:

- scan reveal visuals active
- scan time progression inactive

In other words, visual reveal state and "engine currently running" state must stop being treated as the same boolean.

### 10.3 Implementation rule

Do one of the following, but choose one explicitly and keep it consistent:

#### Option A - recommended

Introduce a derived render condition such as:

```ts
const scanRevealActive = isScanning || hasIntroSnapshotApplied
```

Then mount scan reveal viewers when `scanRevealActive === true`, while only advancing time when `isScanning === true`.

#### Option B - acceptable but less clear

Extend `scanStore` with a dedicated mode flag such as:

```ts
scanPresentationMode: 'off' | 'frozen' | 'running'
```

For MVP, Option A is simpler and better aligned with the current code.

### 10.4 Consequence for `useScanEngine`

`useScanEngine.ts` currently clears uniforms when `isScanning` becomes false.

That behavior must be split:

- stopping a scan should still clear uniforms
- applying a frozen intro snapshot should set uniforms to the preset values and keep them visible
- pausing should not erase the visible reveal state

---

## 11. Authoring Workflow

### 11.1 MVP editor controls

Authenticated editor sees:

- `Start Scan`
- `Pause Scan`
- `Capture Intro`
- `Clear Intro`

### 11.2 Authoring sequence

1. login
2. enter edit mode as usual
3. move camera to desired composition
4. choose desired `viewMode`
5. start scan
6. pause at the desired reveal state
7. optionally open one hero annotation panel
8. click `Capture Intro`
9. current state is serialized and written to `intro/draft.json`

Authoring precondition:

- `Capture Intro` and any "record best keyframe" behavior are only available when `isAuthenticated === true`
- unauthenticated users never enter intro authoring mode
- visitor-side experience is playback-only

### 11.3 Capture source of truth

Read these values from existing runtime state:

- camera position
- `OrbitControls.target`
- `camera.fov`
- `useViewerStore().viewMode`
- `useViewerStore().openAnnotationPanelIds`
- `useViewerStore().selectedAnnotationId`
- `useScanStore().scanT`
- `useScanStore().scanRadius`
- `useScanStore().scanOrigin`
- `useScanStore().maxRadius`
- `useScanStore().duration`
- `useScanStore().scanPhase`
- `useScanStore().triggeredAnnotationIds`
- `useScanStore().activeAnnotationId`

This is a freeze of current runtime state, not a separately authored schema.

### 11.4 Clear behavior

`Clear Intro` should remove intro draft state for the scene.

For MVP, that can mean either:

- deleting `intro/draft.json`, or
- writing `{ enabled: false }` while preserving timestamps

Choose one implementation and keep the API explicit. Recommended: preserve the file and set `enabled: false` so the editor can distinguish "draft intentionally disabled" from "never authored".

---

## 12. Visitor Playback Workflow

### 12.1 Load order

Visitor boot sequence:

```text
App boot
  -> refresh auth session
  -> load cloud scenes
  -> resolve active scene
  -> load release / draft content as today
  -> read live version
  -> load matching intro release
  -> wait for scene mount + camera reset
  -> apply intro preset if present and enabled
  -> show Continue Scan CTA
```

### 12.2 Apply order

Apply in this order only:

1. camera position and target
2. viewer `viewMode`
3. scan snapshot and reveal uniforms
4. open panel ids and active annotation
5. CTA visibility

Do not open panels before the scene and markers exist.

### 12.3 Fallback

If no intro preset exists, or it is disabled:

- fall back to the current default viewer
- do not auto-scan
- do not show `Continue Scan`

This remains the recommended MVP fallback.

---

## 13. Continue Scan Semantics

### 13.1 Continue is not replay

`Continue Scan` means:

- continue from saved `scan.progress`
- keep `triggeredAnnotationIds`
- keep the same `scanOrigin`, `maxRadius`, and `duration`

`Replay` means:

- clear state and restart from 0

These are separate actions and must stay separate in UI text and store logic.

### 13.2 Required store behavior

`resumeScanFromPreset(preset)` must:

- restore `scanT`
- restore `scanRadius`
- restore `scanOrigin`
- restore `maxRadius`
- restore `duration`
- restore `triggeredAnnotationIds`
- restore `activeAnnotationId`
- mark the scan as running
- continue progression from saved progress rather than from 0

### 13.3 Annotation behavior during continue

When resuming:

- already triggered annotations stay triggered
- already open hero panel can remain open for the first frame
- new triggers only occur for annotations not already in `triggeredIds`

---

## 14. API Contract

### 14.1 Endpoints

```text
GET  /api/intro/:sceneId            -> authenticated editor reads intro draft
PUT  /api/intro/:sceneId            -> authenticated editor writes intro draft
GET  /api/intro/:sceneId?version=N  -> public reader fetches intro release N
```

### 14.2 API rules

- `GET` without `version` returns draft and requires auth
- `GET` with `version` returns release and is public
- `PUT` requires auth
- no unauthenticated route may create, update, clear, or version intro preset state
- publish remains under `/api/publish/:sceneId`
- do not add `/api/intro/publish/:sceneId`

### 14.3 File responsibility map

- `api/intro/[sceneId].ts` owns intro read/write behavior
- `api/publish/[sceneId].ts` owns copying intro draft into release `N`
- `src/lib/introApi.ts` or `src/lib/publishApi.ts` owns client helpers

---

## 15. File-Level Implementation Plan

### Phase A - Domain and persistence

#### Files

- `src/types/index.ts`
- `api/intro/[sceneId].ts`
- `api/publish/[sceneId].ts`
- `src/lib/introApi.ts` or `src/lib/publishApi.ts`

#### Deliverables

- `IntroPreset` type added
- intro draft and intro release Blob paths supported
- editor can read/write intro draft
- publish copies intro draft into intro release `N`

#### Acceptance

- authenticated `GET /api/intro/:sceneId` returns a stable draft payload
- public `GET /api/intro/:sceneId?version=N` returns release `N`
- publishing scene release `N` also creates intro release `N`

### Phase B - Authoring

#### Files

- authoring UI control location
- hook for capture logic
- `src/store/scanStore.ts`

#### Deliverables

- `pauseScan()` implemented
- editor can capture current intro state
- editor can clear/disable intro state

#### Acceptance

- capture reflects current camera angle exactly
- capture preserves current scan progress and current open panel ids
- capture does not mutate scene annotations or release content

### Phase C - Visitor playback

#### Files

- `src/App.tsx`
- `src/components/viewer/SceneCanvas.tsx`
- scan orchestration hooks/components

#### Deliverables

- matching intro release is loaded for the current live version
- intro preset applies after scene mount and camera reset
- `Continue Scan` resumes from preset progress

#### Acceptance

- visitor sees the authored opening state on page load
- clicking `Continue Scan` resumes from captured progress, not from 0
- scenes without intro preset continue to use the current default viewer path

---

## 16. Engineering Rules

- keep intro preset separate from `SceneDraft`
- do not add timeline semantics to the schema
- do not create a second publish pipeline
- do not tie intro versioning to local persisted Zustand state
- do not bypass current scene boot and publish flow
- do not implement intro playback by ad hoc direct mutation from random components; keep the restore logic centralized

---

## 17. Final Implementation Summary

Intro preset should be implemented as:

- a separate Blob-backed JSON asset
- version-locked to the normal scene release
- restored through hook-driven runtime orchestration
- resumed through explicit scan store actions

The key technical rule is:

**The persisted intro preset is a data asset, but the act of capturing, applying, and resuming it belongs to hooks plus store actions.**

That is the architecture this repo can execute cleanly.
