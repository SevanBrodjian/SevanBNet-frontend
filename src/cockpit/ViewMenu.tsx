import { currentView, reset, setView, useCockpit, VIEWS } from "./cockpit";

// The subtle navbar control: pick a view, or reset everything. It must stay legible and
// usable in every view, so its styles are exempt from the cockpit's effects.
export default function ViewMenu() {
  const view = currentView(useCockpit());
  return (
    <div className="viewmenu" data-cockpit-exempt>
      <label className="lbl" htmlFor="view-select">
        View
      </label>
      <select id="view-select" value={view} onChange={(e) => setView(e.target.value)}>
        {Object.entries(VIEWS).map(([id, v]) => (
          <option key={id} value={id}>
            {v.label}
          </option>
        ))}
        {view === "custom" && <option value="custom">Custom</option>}
      </select>
      <button type="button" className="lbl reset" onClick={reset}>
        Reset
      </button>
    </div>
  );
}
