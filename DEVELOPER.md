# Developer Notes

## Tech Stack
- **Vite + React 19 + TypeScript** (`verbatimModuleSyntax` -- always use `import type` for type-only imports)
- **Rough.js** -- Hand-drawn shape rendering on `<canvas>`
- **@use-gesture/react** -- Pan, zoom, pinch, drag gestures
- **Zustand** -- Single store for all state (`src/store/diagramStore.ts`)
- **ELK.js** -- Auto-layout engine (`src/core/layout.ts`)
- **vite-plugin-pwa** -- Service worker and manifest generation

## Project Structure

```
src/
  core/
    model.ts          Shape/Line/Diagram types, createShape factory
    autoResize.ts     Text measurement and auto-resize logic
    layout.ts         ELK.js layout runner
    routing.ts        Connector routing (straight, or orthogonal around shapes)
    angleLock.ts      45° drag constraint maths
  store/
    diagramStore.ts   Zustand store -- all state and actions
  components/
    Canvas/
      DiagramCanvas.tsx   Main canvas: grid, shapes, lines, gestures, hit testing
    Toolbar/
      Toolbar.tsx         Shape tools, undo/redo, layout lock, file ops, export, theme
    PropertyPanel/
      PropertyPanel.tsx   Color palette, icons, "Set as Default" buttons
    TextEditor/
      TextEditor.tsx      Inline text editing overlay
  export/
    excalidraw.ts     Excalidraw JSON export
    png.ts            Canvas-based PNG export (2x DPI)
    svg.ts            SVG string export
    bounds.ts         Shared export extent (incl. connector routes and labels) and label box
    download.ts       Blob/text download helpers
  utils/
    geometry.ts       Hit testing, edge points, polygon vertices
```

## Key Architecture

### State Management
All mutable state lives in a single Zustand store. Components subscribe to individual selectors to minimize re-renders. No props drilling -- components read directly from the store.

### Selection and Groups
`selection` is a list of element ids (unique across shapes, connectors, free lines and text boxes). There is no per-element `selected` flag, so selecting never replaces the `shapes` array. `select(ids, mode)` replaces, adds to or toggles the selection, and always pulls in every member of any group touched (`withGroupMates()`), so a selection holds whole groups. Style actions (`updateShapeColors`, `changeShapeType`, `updateShapeIcon(Align)`, `updateLineColor`, `updateTextStyle`) take id lists and push one history entry for the lot.

A group is an optional `groupId` on shapes, free lines and text boxes (flat, no nesting; connectors belong to their shapes). `groupSelection()` gives the selection a new id, merging any groups in it; `ungroupSelection()` clears it; `deleteSelected()` dissolves groups left with fewer than two members. Excalidraw export maps `groupId` to `groupIds`, including connectors whose ends share a group.

Dragging in `DiagramCanvas.tsx`: a drag on an item selects it if needed, captures `MoveOrigins` for every selected item, and each frame derives the offset from the grabbed item's own constraint (shape centre: angle lock / grid snap; text box or free line: `constrainPoint()`), then applies it to all via `moveItems()`. A drag on empty canvas draws a selection box (`idsInRect()`); panning is two-finger (the pinch handler pans by the movement of the point between the fingers), middle button or Space+drag.

### Rendering
Shapes are rendered on a single `<canvas>` element using Rough.js. The render loop runs via `requestAnimationFrame` triggered by state changes. No React DOM elements are used for shapes -- everything is drawn imperatively.

### Cylinder Body Fill
The cylinder shape is composed of separate Rough.js primitives (ellipse, lines, arc). Since Rough.js draws each piece independently, the body area between the top ellipse and bottom arc must be filled with a plain `ctx.fillRect()` + `ctx.ellipse()` arc *before* the Rough.js strokes. This is done in both `DiagramCanvas.tsx` (on-screen) and `png.ts` (export). The SVG export uses a `<rect>` element instead.

### Auto-Layout
`triggerLayout()` is called after `addLine()`, `deleteSelected()`, and `updateShapeText()`. It only lays out shapes that are connected by at least one line. Unconnected shapes are left in place.

The layout result is offset so the center of mass of connected shapes stays constant -- this prevents the diagram from jumping to the origin.

Both run through `startLayout()`. ELK is asynchronous, so when a result arrives it is dropped if the connected shapes' positions or sizes, or the connectors, changed in the meantime (drag, undo, load...). A `triggerLayout()` call while a layout is running is queued and runs once it finishes.

When `layoutLocked` is true, `triggerLayout()` is a no-op. `forceLayout()` bypasses the lock and always runs (used by the Arrange button). Force layout pushes history first so it's undoable.

Groups are laid out as clusters: each group with a connected member becomes an ELK compound node holding all its shapes (`elk.hierarchyHandling: INCLUDE_CHILDREN`); edges inside one group go in that node, the rest at the root, and child positions come back relative to the group. A group's free lines and text boxes move with the displacement of the nearest member shape.

Children are passed to ELK in breadth-first flow order from root shapes (no incoming lines), with `MODEL_ORDER` cycle breaking, so loops become back-edges rather than reordering the flow.

### Connector Routing
`routeLine()` in `routing.ts` is the single source of line geometry for canvas rendering, hit testing and all three exporters. A line is straight (edge-to-edge) when that segment clears every other shape; otherwise it is routed orthogonally with A* over a sparse grid built from padded shape bounds, with a bend penalty. Routes are computed from live geometry on every render rather than stored, so they stay valid after manual moves. Routes are cached per `shapes` array (a `WeakMap`), so pans, zooms, hit tests and exports reuse them until a shape changes; this relies on the store never mutating a shapes array in place. A new array whose shapes have the same ids, types, positions and sizes as the previous one (a selection, colour or text change that didn't resize) keeps the previous routes. In diagrams of 40+ shapes (`FREEZE_ROUTES_MIN_SHAPES` in `DiagramCanvas.tsx`), dragging a shape draws connectors not attached to it from a snapshot of the shapes taken at drag start, so only the dragged shape's own connectors re-route per frame; everything re-routes once on drop. Obstacles are rasterised once per route onto a doubled grid (grid lines and the midpoints between them), so node and edge checks are array lookups.

### Free Lines
`FreeLine` (`model.ts`) is a standalone segment `{ x1, y1, x2, y2, color }`, kept in its own `freeLines` array alongside `shapes` and `lines` (connectors). It is part of history snapshots, auto-save, save/load (older files without `freeLines` load as `[]`) and all three exporters (Excalidraw exports it as an unbound `line` element). Free lines are not routing obstacles. They share `updateLineColor()` and the line colour default with connectors, since ids are unique across both arrays.

Canvas drags are measured from the gesture's `initial` pointer position, not the first `onDrag` event, which only fires once the drag threshold has been crossed.

### Text Boxes
`TextBox` (`model.ts`) is standalone text `{ x, y, text, scale, bold, color }`, kept in a `texts` array. `(x, y)` is the top-left corner. The font size is `scale × TEXT_BASE_SIZE` (16px), so sizes are relative presets (`TEXT_SIZES` in `core/textBox.ts`). `layoutTextBox()` measures a box (lines split on `\n`, no wrapping), and the canvas, hit testing, editor placement and all three exporters use it. Text boxes are drawn above shapes and are hit-tested before them.

Editing pushes history once per session (`addText` / `startEditingText`), not per keystroke. `stopEditingText()` removes a box left empty, and gives back that history entry if the edit changed nothing. Text defaults are stored in `DefaultPalette.text` (optional, so older saved palettes still load).

### Grid Snap and Angle Lock
Snapping works on shape **centres** (`snapShapePosition()` in `model.ts`) because `autoResizeShape()` keeps the centre fixed. Dragging derives position from the drag-start origin every frame (not accumulated deltas), so snapping never drifts. With Shift held or `angleLock` on, `lockToAngles()` constrains the centre to 45° rays from connected shapes' centres (or the drag start if unconnected), preferring ray intersections that satisfy two neighbours. Angle lock takes priority over grid snap, but quantises distance along the ray to the grid step.

### Default Palette
`DefaultPalette` stores per-shape-type color defaults and line color defaults. Stored in localStorage as JSON under `idrawm-defaults`. The `createShape()` factory accepts an optional colors override; the store passes palette defaults when calling it from `addShape()`.

### Hit Testing
`geometry.ts` provides `hitTestShape()` which dispatches to shape-specific logic (rect bounds, ellipse equation, polygon point-in-polygon). `getPolygonVertices()` is shared across diamond, triangle, parallelogram, and hexagon for both rendering and hit testing.

### Transparent Colors
`'transparent'` is a valid fill/stroke/text color value. The color picker (`<input type="color">`) is hidden when the current value is transparent since it doesn't support it. Rough.js handles `fill: 'transparent'` correctly with `fillStyle: 'solid'`.

`AUTO_COLOR` (`'auto'`, `model.ts`) is a line / free line / text box colour that follows the theme. The canvas resolves it with `resolveColor(color, tc.ink)` (`INK_LIGHT` / `INK_DARK`); exporters resolve it to `INK_LIGHT` up front with `withResolvedColors()`, since their background is white. It is the default line and text colour. Saved diagrams and palettes from before it existed used `INK_LIGHT` (`#2d3436`) as the fixed default, so `migrateInk()` turns that value into `'auto'` on load, but only for unversioned data. Files, auto-saves and palettes now carry `version: DIAGRAM_VERSION` (2, `core/validate.ts`), and from version 2 a stored `#2d3436` is an explicit swatch choice and is kept.

## Build & Check

```bash
npx tsc --noEmit -p tsconfig.app.json   # Type-check (the root tsconfig.json only holds references)
npx vite build        # Production build
npm run dev           # Dev server with HMR
```

ELK runs in a Web Worker: `layout.ts` loads `elkjs/lib/elk-api.js` with the worker script's URL (`elk-worker.min.js?url`, ~1.6MB, precached by the service worker), so large layouts don't block the UI. Both are loaded lazily on the first layout.

## Conventions
- Shapes can change type (`changeShapeType()`, from the property panel). The shape keeps its id, so connectors stay attached; it is re-fitted with `autoResizeShape()` around its centre (some types need extra text padding) and layout re-runs. Colours are kept rather than switching to the new type's defaults
- Auto-save waits for the IndexedDB transaction to complete; a failure (e.g. quota) sets `saveError`, which the toolbar shows as "Not saved" until a later save succeeds. On startup `App` renders nothing until the auto-save has been restored, so edits can't be overwritten by a late restore, and the restore is not an undoable step
- Loaded files and the auto-save go through `parseDiagram()` (`core/validate.ts`) before touching state. It checks every field's type, finite numbers, colours (hex, keyword, `rgb()`/`hsl()`, `transparent`, `auto` only, so nothing can break out of an SVG attribute), unique ids across all arrays and connector endpoints, and rejects the whole file on the first problem; `loadDiagram()` returns that message. New fields must be added there. The SVG exporter also escapes every colour attribute
- Old shape types (`square`, `circle`, `oval`) are migrated to `rectangle`/`ellipse` on file load
- Shape IDs use format `el_{counter}_{timestamp_base36}`
- History is capped at 50 entries; undo/redo operates on full shapes + lines + freeLines + texts snapshots. `pushHistory()` records the pre-action state; `history[historyIndex]` is what undo restores next, and the present state is appended on the first undo so redo can return to it
