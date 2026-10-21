# iDrawM

A touch-first auto-layout diagramming PWA. Inspired by Instaviz, built for the modern web.

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. Install as a PWA from the browser menu for offline use.

## Features

### Shapes
Nine shape types: Rectangle, Ellipse, Diamond, Triangle, Parallelogram, Rounded Rectangle, Hexagon, Cylinder, Cloud.

Click a shape tool in the toolbar, then click on the canvas to place it. Double-click a shape to edit its text.

To change a shape into another type, select it and pick the new type under **Shape** in the panel on the right. Its text, colours, icons and connections are kept, and it resizes around its centre to fit the text.

Each shape has three text zones: **header**, **body**, and **footer**. Double-click opens the body zone by default.

### Connections
Select the **Connect** tool (or press `L`), then drag from one shape to another to create a directed arrow. Double-click a line to add a label.

Lines take a straight path when nothing is in the way, and bend around shapes otherwise.

### Lines
Select the **Line** tool and drag to draw a free-standing line (for dividers, underlines and the like). It isn't attached to any shape, and connectors don't route around it. Hold `Shift` (or turn on **Angle**) for exact horizontal, vertical and 45° diagonal lines; with **Grid** on, both ends snap to the grid.

Click a line to select it, drag its middle to move it, or drag the round handle at either end to reshape it. The same Shift/Angle and Grid rules apply.

### Text
Select the **Text** tool and click where the text should start, for page headings and titles. Type in the box that opens: **Enter** finishes and **Shift+Enter** starts a new line. A text box left empty is removed.

Text sizes are relative to normal text: **S** (1×), **M** (1.5×), **L** (2×, the default), **XL** (3×) and **XXL** (4×). Pick a size, bold on/off and a colour in the panel on the right. **Set as Default** applies them to new text. Double-click a text box (or click it with the Text tool) to edit it. Drag it to move it; Grid and Angle work as they do for lines.

### Grid and Angle Lock
**Grid** -- Turn on to snap shape centres to the 20px grid. Turning it on aligns every existing shape (undoable); new shapes, dragged shapes and Arrange results all land on grid points.

**Angle** -- Hold `Shift` while dragging a shape to lock its connectors to 45° steps (0°, 45°, 90° ...). It lines up with two connected shapes at once where it can. A shape with no connectors is locked to straight or diagonal moves from where the drag started. On touch devices, the **Angle** toolbar button keeps the lock on without a keyboard. With Grid on, locked positions also stay on the grid.

### Auto-Layout
Connected shapes are automatically arranged using ELK.js when you add or remove connections. The layout preserves the center of mass so shapes don't jump across the screen.

**Layout Lock** -- Click the lock button in the toolbar to freeze positions. While locked, adding connections or editing text won't rearrange shapes, so you can fine-tune positions manually.

**Arrange** -- Click Arrange to manually trigger a re-layout. If layout is locked, you'll get a confirmation prompt since this overwrites manual positions. Arrange is undoable.

### Selecting and Grouping
- **Select** -- Click (or tap) an item. **Shift**-, **Ctrl**- or **Cmd**-click adds or removes it.
- **Selection box** -- Drag on empty canvas to select everything wholly inside the box (a connector is included when both its shapes are). Hold Shift to add to the current selection.
- **Select all** -- `Ctrl+A`.
- **Move** -- Drag any selected item to move the whole selection. Grid and Angle apply to the item you grab.
- **Edit together** -- With several items selected, the panel on the right changes all of them: colours, shape type and icons for shapes, colour for lines, size and colour for text. A swatch is highlighted only when every selected item already uses it.
- **Group** -- Select shapes, lines and text, then press **Group** (`Ctrl+G`). Clicking any member selects the whole group, and a dashed outline shows it. With a single group selected the button becomes **Ungroup** (`Ctrl+Shift+G`). Grouping items that are already in groups merges them.
- **Groups and auto-layout** -- A group whose shapes are connected is laid out as one cluster, so its members stay together. Lines and text in the group move with the nearest shape in it.

### Styling
Select a shape or line to open the property panel on the right:

- **Fill / Border / Text colors** -- Pick from the palette or use the color picker. The first swatch is transparent (checkerboard pattern).
- **Icons** -- Assign emoji icons to any text zone (header, body, footer) with left/center/right alignment.
- **Line color** -- Same palette, applied to the selected connection or line.
- **Auto colour** -- The half-dark, half-light swatch (first for lines and text) follows the theme: dark on the light canvas, light on the dark one. It's the default for connections, lines and text. Exports use the dark version, since they have a white background.

### Default Colors
Each "Set as Default" button saves the current color as the default for that shape type. New shapes of that type will use your chosen colors. Line defaults work the same way. Defaults persist across sessions.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `V` | Select tool |
| `R` | Rectangle |
| `E` | Ellipse |
| `D` | Diamond |
| `T` | Triangle |
| `P` | Parallelogram |
| `U` | Rounded Rectangle |
| `H` | Hexagon |
| `Y` | Cylinder |
| `K` | Cloud |
| `L` | Connect |
| `Delete` / `Backspace` | Delete selected |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Escape` | Cancel connection, or clear the selection |
| `Ctrl+A` | Select everything |
| `Ctrl+G` | Group the selection |
| `Ctrl+Shift+G` | Ungroup the selection |
| `Shift` / `Ctrl` + click | Add to or remove from the selection |
| `Space` + drag | Pan |
| Wheel / `Shift`+wheel | Pan up-down / sideways |
| `Ctrl`+wheel / `Cmd`+wheel | Zoom |

### Navigation
- **Pan** -- Scroll with the mouse wheel or a trackpad (`Shift`+wheel scrolls sideways), drag with two fingers, drag with the middle mouse button, or hold `Space` and drag. (A one-finger or left-button drag on empty canvas draws a selection box.)
- **Zoom** -- `Ctrl`+wheel (`Cmd`+wheel on Mac), or pinch on a trackpad or touch screen, centred on the pointer or fingers
- **Move shapes** -- Drag a shape

### File Operations
- **Save / Load** -- Save diagrams as `.idrawm.json` files and load them back
- **Auto-save** -- Diagrams are automatically saved to IndexedDB and restored on reload

### Export
- **Excalidraw** (`.excalidraw`) -- Open in Excalidraw for further editing
- **PNG** -- 2x resolution raster image
- **SVG** -- Scalable vector graphic

### Theme
Toggle between light and dark mode with the theme button. Your preference persists across sessions.

## Persistence Summary

| Setting | Storage | Key |
|---------|---------|-----|
| Theme | localStorage | `idrawm-theme` |
| Default colors | localStorage | `idrawm-defaults` |
| Layout lock | localStorage | `idrawm-layout-locked` |
| Snap to grid | localStorage | `idrawm-snap-grid` |
| Angle lock | localStorage | `idrawm-angle-lock` |
| Diagram auto-save | IndexedDB | `idrawm` / `autosave` |
