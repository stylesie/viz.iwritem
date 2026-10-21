# Developer Notes

## Tech Stack
- **Vite + React 19 + TypeScript** (`verbatimModuleSyntax` -- always use `import type` for type-only imports)
- **Rough.js** -- Hand-drawn shape rendering on `<canvas>`
- **@use-gesture/react** -- Pan, zoom, pinch, drag gestures
- **Zustand** -- Single store for all state (`src/store/diagramStore.ts`)
- **ELK.js** -- Auto-layout engine (with Dagre fallback in `src/core/layout.ts`)
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
    download.ts       Blob/text download helpers
  utils/
    geometry.ts       Hit testing, edge points, polygon vertices
```

## Key Architecture

### State Management
All mutable state lives in a single Zustand store. Components subscribe to individual selectors to minimize re-renders. No props drilling -- components read directly from the store.

### Rendering
Shapes are rendered on a single `<canvas>` element using Rough.js. The render loop runs via `requestAnimationFrame` triggered by state changes. No React DOM elements are used for shapes -- everything is drawn imperatively.

### Cylinder Body Fill
The cylinder shape is composed of separate Rough.js primitives (ellipse, lines, arc). Since Rough.js draws each piece independently, the body area between the top ellipse and bottom arc must be filled with a plain `ctx.fillRect()` + `ctx.ellipse()` arc *before* the Rough.js strokes. This is done in both `DiagramCanvas.tsx` (on-screen) and `png.ts` (export). The SVG export uses a `<rect>` element instead.

### Auto-Layout
`triggerLayout()` is called after `addLine()`, `deleteSelected()`, and `updateShapeText()`. It only lays out shapes that are connected by at least one line. Unconnected shapes are left in place.

The layout result is offset so the center of mass of connected shapes stays constant -- this prevents the diagram from jumping to the origin.

When `layoutLocked` is true, `triggerLayout()` is a no-op. `forceLayout()` bypasses the lock and always runs (used by the Arrange button). Force layout pushes history first so it's undoable.

Children are passed to ELK in breadth-first flow order from root shapes (no incoming lines), with `MODEL_ORDER` cycle breaking, so loops become back-edges rather than reordering the flow.

### Connector Routing
`routeLine()` in `routing.ts` is the single source of line geometry for canvas rendering, hit testing and all three exporters. A line is straight (edge-to-edge) when that segment clears every other shape; otherwise it is routed orthogonally with A* over a sparse grid built from padded shape bounds, with a bend penalty. Routes are computed from live geometry on every render rather than stored, so they stay valid after manual moves.

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

## Build & Check

```bash
npx tsc --noEmit      # Type-check
npx vite build        # Production build
npm run dev           # Dev server with HMR
```

The ELK.js chunk is ~1.4MB (450KB gzipped). It's loaded lazily on first layout trigger.

## Conventions
- Shapes can change type (`changeShapeType()`, from the property panel). The shape keeps its id, so connectors stay attached; it is re-fitted with `autoResizeShape()` around its centre (some types need extra text padding) and layout re-runs. Colours are kept rather than switching to the new type's defaults
- Old shape types (`square`, `circle`, `oval`) are migrated to `rectangle`/`ellipse` on file load
- Shape IDs use format `el_{counter}_{timestamp_base36}`
- History is capped at 50 entries; undo/redo operates on full shapes + lines + freeLines + texts snapshots. `pushHistory()` records the pre-action state; `history[historyIndex]` is what undo restores next, and the present state is appended on the first undo so redo can return to it
