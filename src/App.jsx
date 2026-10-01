import { useEffect, useMemo, useRef, useState } from "react";

const KEY = "heatmaps:v1";
const WEEKS = 53;
const uid = () => Math.random().toString(36).slice(2, 9);

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s?.heatmaps?.length) return s;
  } catch {}
  const id = uid();
  return { activeId: id, heatmaps: [{ id, name: "My heatmap", data: {} }] };
}

// Monday-first list of days covering the last ~year, ending with this week.
function buildDays() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (WEEKS - 1) * 7);
  return Array.from({ length: WEEKS * 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { key: iso(d), date: d, future: d > today };
  });
}

// t in [0,1] -> green (hue 120) through yellow to red (hue 0)
const colorAt = (t) => `hsl(${Math.round(120 - 120 * t)} 65% 45%)`;

export default function App() {
  const [store, setStore] = useState(load);
  const [editing, setEditing] = useState(null); // {type:'cell',key} | {type:'new'} | {type:'rename'}
  const scroller = useRef(null);
  const days = useMemo(buildDays, []);

  const active = store.heatmaps.find((h) => h.id === store.activeId) ?? store.heatmaps[0];

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch {}
  }, [store]);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [active.id]);

  const { min, max } = useMemo(() => {
    const v = Object.values(active.data);
    return v.length ? { min: Math.min(...v), max: Math.max(...v) } : { min: 0, max: 0 };
  }, [active.data]);

  const colorFor = (v) => (max === min ? colorAt(0) : colorAt((v - min) / (max - min)));

  const updateActive = (fn) =>
    setStore((s) => ({ ...s, heatmaps: s.heatmaps.map((h) => (h.id === active.id ? fn(h) : h)) }));

  const setValue = (key, value) =>
    updateActive((h) => {
      const data = { ...h.data };
      if (value === null) delete data[key];
      else data[key] = value;
      return { ...h, data };
    });

  const addHeatmap = (name) => {
    const id = uid();
    setStore((s) => ({ activeId: id, heatmaps: [...s.heatmaps, { id, name, data: {} }] }));
  };

  const deleteActive = () => {
    if (store.heatmaps.length < 2) return;
    if (!window.confirm(`Delete "${active.name}" and all its entries?`)) return;
    setStore((s) => {
      const heatmaps = s.heatmaps.filter((h) => h.id !== active.id);
      return { activeId: heatmaps[0].id, heatmaps };
    });
  };

  return (
    <main className="app">
      <nav className="tabs" aria-label="Heatmaps">
        {store.heatmaps.map((h) => (
          <button
            key={h.id}
            className={h.id === active.id ? "tab on" : "tab"}
            onClick={() => setStore((s) => ({ ...s, activeId: h.id }))}
          >
            {h.name}
          </button>
        ))}
        <button className="tab add" onClick={() => setEditing({ type: "new" })} aria-label="New heatmap">
          +
        </button>
      </nav>

      <header className="head">
        <h1>{active.name}</h1>
        <div className="actions">
          <button onClick={() => setEditing({ type: "rename" })}>Rename</button>
          <button onClick={deleteActive} disabled={store.heatmaps.length < 2}>
            Delete
          </button>
        </div>
      </header>

      <div className="scroller" ref={scroller}>
        <div className="grid">
          {days.map((d) =>
            d.future ? (
              <span key={d.key} className="cell gap" />
            ) : (
              <button
                key={d.key}
                className="cell"
                style={active.data[d.key] !== undefined ? { background: colorFor(active.data[d.key]) } : undefined}
                onClick={() => setEditing({ type: "cell", key: d.key })}
                aria-label={`${d.key}${active.data[d.key] !== undefined ? `: ${active.data[d.key]}` : ""}`}
              />
            )
          )}
        </div>
      </div>

      <div className="legend">
        <span>{Object.keys(active.data).length ? min : "low"}</span>
        <span className="bar" />
        <span>{Object.keys(active.data).length ? max : "high"}</span>
      </div>

      {editing?.type === "cell" && (
        <Sheet
          title={new Date(editing.key + "T00:00").toLocaleDateString(undefined, {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          })}
          label="Value"
          numeric
          initial={active.data[editing.key]}
          onSave={(v) => setValue(editing.key, parseFloat(v))}
          onClear={active.data[editing.key] !== undefined ? () => setValue(editing.key, null) : null}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.type === "new" && (
        <Sheet title="New heatmap" label="Name" onSave={addHeatmap} onClose={() => setEditing(null)} />
      )}
      {editing?.type === "rename" && (
        <Sheet
          title="Rename heatmap"
          label="Name"
          initial={active.name}
          onSave={(name) => updateActive((h) => ({ ...h, name }))}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}

function Sheet({ title, label, numeric, initial, onSave, onClear, onClose }) {
  const [text, setText] = useState(initial === undefined ? "" : String(initial));
  const valid = numeric ? text.trim() !== "" && Number.isFinite(parseFloat(text)) : text.trim() !== "";

  const save = () => {
    if (!valid) return;
    onSave(text.trim());
    onClose();
  };

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <label>
          {label}
          <input
            autoFocus
            value={text}
            type={numeric ? "number" : "text"}
            inputMode={numeric ? "decimal" : "text"}
            step={numeric ? "any" : undefined}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </label>
        <div className="row">
          {onClear && (
            <button
              className="ghost"
              onClick={() => {
                onClear();
                onClose();
              }}
            >
              Clear
            </button>
          )}
          <span className="spacer" />
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save} disabled={!valid}>Save</button>
        </div>
      </div>
    </div>
  );
}
