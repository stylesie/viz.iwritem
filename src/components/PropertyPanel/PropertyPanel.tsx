import { useDiagramStore } from '../../store/diagramStore'
import type { TextZone } from '../../store/diagramStore'
import './PropertyPanel.css'

const PALETTE = [
  '#2d3436', '#636e72', '#b2bec3', '#dfe6e9', '#ffffff',
  '#d63031', '#e17055', '#fdcb6e', '#ffeaa7', '#fab1a0',
  '#00b894', '#00cec9', '#0984e3', '#6c5ce7', '#a29bfe',
  '#e8f4f8', '#dff9fb', '#c7ecee', '#ffecd2', '#fcf3cf',
  '#55efc4', '#81ecec', '#74b9ff', '#a3d8f4', '#fd79a8',
]

const ICONS: { icon: string; label: string }[] = [
  { icon: '', label: 'None' },
  { icon: '\u2605', label: 'Star' },           // ★
  { icon: '\u2714', label: 'Check' },           // ✔
  { icon: '\u2718', label: 'Cross' },           // ✘
  { icon: '\u26A0', label: 'Warning' },         // ⚠
  { icon: '\u2139', label: 'Info' },            // ℹ
  { icon: '\u2764', label: 'Heart' },           // ❤
  { icon: '\u26A1', label: 'Lightning' },       // ⚡
  { icon: '\u2699', label: 'Gear' },            // ⚙
  { icon: '\u270E', label: 'Pencil' },          // ✎
  { icon: '\u2709', label: 'Envelope' },        // ✉
  { icon: '\u260E', label: 'Phone' },           // ☎
  { icon: '\u2615', label: 'Cup' },             // ☕
  { icon: '\u2601', label: 'Cloud' },           // ☁
  { icon: '\u263A', label: 'Smile' },           // ☺
  { icon: '\u2602', label: 'Umbrella' },        // ☂
  { icon: '\u266B', label: 'Music' },           // ♫
  { icon: '\u2691', label: 'Flag' },            // ⚑
  { icon: '\u25B6', label: 'Play' },            // ▶
  { icon: '\u25A0', label: 'Stop' },            // ■
  { icon: '\u27A4', label: 'Arrow' },           // ➤
  { icon: '\u2B50', label: 'Gold Star' },       // ⭐
  { icon: '\u2753', label: 'Question' },        // ❓
  { icon: '\u2757', label: 'Exclamation' },     // ❗
  { icon: '\u{1F512}', label: 'Lock' },         // 🔒
  { icon: '\u{1F513}', label: 'Unlock' },       // 🔓
  { icon: '\u{1F4C1}', label: 'Folder' },       // 📁
  { icon: '\u{1F4C4}', label: 'Document' },     // 📄
  { icon: '\u{1F464}', label: 'Person' },       // 👤
  { icon: '\u{1F465}', label: 'People' },       // 👥
  { icon: '\u{1F4E6}', label: 'Package' },      // 📦
  { icon: '\u{1F527}', label: 'Wrench' },       // 🔧
  { icon: '\u{1F4BB}', label: 'Computer' },     // 💻
  { icon: '\u{1F4F1}', label: 'Mobile' },       // 📱
  { icon: '\u{1F310}', label: 'Globe' },        // 🌐
  { icon: '\u{1F6E1}', label: 'Shield' },       // 🛡
]

const ICON_ZONES: { zone: TextZone; label: string }[] = [
  { zone: 'header', label: 'Header' },
  { zone: 'body', label: 'Body' },
  { zone: 'footer', label: 'Footer' },
]

function ColorSwatch({ color, selected, onClick }: {
  color: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      className={`color-swatch ${selected ? 'selected' : ''}`}
      style={{ backgroundColor: color }}
      onClick={onClick}
      title={color}
    />
  )
}

function ShapeProperties() {
  const selection = useDiagramStore(s => s.selection)
  const shapes = useDiagramStore(s => s.shapes)
  const updateShapeColors = useDiagramStore(s => s.updateShapeColors)
  const updateShapeIcon = useDiagramStore(s => s.updateShapeIcon)

  if (!selection || selection.type !== 'shape') return null
  const shape = shapes.find(s => s.id === selection.id)
  if (!shape) return null

  return (
    <div className="property-panel">
      <div className="prop-section">
        <div className="prop-label">Fill</div>
        <div className="color-grid">
          {PALETTE.map(c => (
            <ColorSwatch
              key={`fill-${c}`}
              color={c}
              selected={shape.fillColor === c}
              onClick={() => updateShapeColors(shape.id, { fillColor: c })}
            />
          ))}
        </div>
        <input
          type="color"
          className="color-input"
          value={shape.fillColor}
          onChange={e => updateShapeColors(shape.id, { fillColor: e.target.value })}
        />
      </div>

      <div className="prop-section">
        <div className="prop-label">Border</div>
        <div className="color-grid">
          {PALETTE.slice(0, 10).map(c => (
            <ColorSwatch
              key={`stroke-${c}`}
              color={c}
              selected={shape.strokeColor === c}
              onClick={() => updateShapeColors(shape.id, { strokeColor: c })}
            />
          ))}
        </div>
        <input
          type="color"
          className="color-input"
          value={shape.strokeColor}
          onChange={e => updateShapeColors(shape.id, { strokeColor: e.target.value })}
        />
      </div>

      <div className="prop-section">
        <div className="prop-label">Text</div>
        <div className="color-grid">
          {PALETTE.slice(0, 10).map(c => (
            <ColorSwatch
              key={`text-${c}`}
              color={c}
              selected={shape.textColor === c}
              onClick={() => updateShapeColors(shape.id, { textColor: c })}
            />
          ))}
        </div>
        <input
          type="color"
          className="color-input"
          value={shape.textColor}
          onChange={e => updateShapeColors(shape.id, { textColor: e.target.value })}
        />
      </div>

      <div className="prop-section">
        <div className="prop-label">Icons</div>
        {ICON_ZONES.map(({ zone, label }) => {
          const iconKey = `${zone}Icon` as keyof typeof shape
          const currentIcon = shape[iconKey] as string
          return (
            <div key={zone} className="icon-zone-row">
              <span className="icon-zone-label">{label}</span>
              <div className="icon-grid">
                {ICONS.map(({ icon, label: iconLabel }) => (
                  <button
                    key={`${zone}-${iconLabel}`}
                    className={`icon-btn ${currentIcon === icon ? 'selected' : ''}`}
                    onClick={() => updateShapeIcon(shape.id, zone, icon)}
                    title={iconLabel}
                  >
                    {icon || '\u2013'}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LineProperties() {
  const selection = useDiagramStore(s => s.selection)
  const lines = useDiagramStore(s => s.lines)
  const updateLineColor = useDiagramStore(s => s.updateLineColor)

  if (!selection || selection.type !== 'line') return null
  const line = lines.find(l => l.id === selection.id)
  if (!line) return null

  return (
    <div className="property-panel">
      <div className="prop-section">
        <div className="prop-label">Line Colour</div>
        <div className="color-grid">
          {PALETTE.slice(0, 15).map(c => (
            <ColorSwatch
              key={`line-${c}`}
              color={c}
              selected={line.color === c}
              onClick={() => updateLineColor(line.id, c)}
            />
          ))}
        </div>
        <input
          type="color"
          className="color-input"
          value={line.color}
          onChange={e => updateLineColor(line.id, e.target.value)}
        />
      </div>
    </div>
  )
}

export default function PropertyPanel() {
  const selection = useDiagramStore(s => s.selection)
  if (!selection) return null

  return (
    <>
      <ShapeProperties />
      <LineProperties />
    </>
  )
}
