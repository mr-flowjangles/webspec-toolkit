/**
 * webspec popup — v0.3.7 scaffold.
 *
 * Audit + Record actions are placeholders here; the real handlers land in
 * later M5 PRs (audit injection → next PR, recorder → after that).
 */
export function App(): JSX.Element {
  return (
    <main className="popup">
      <h1>webspec</h1>
      <p className="tagline">Shift-left companion for web app development.</p>
      <div className="actions">
        <button type="button" disabled title="Coming in the next M5 PR">
          Audit this tab
        </button>
        <button type="button" disabled title="Coming after audit mode">
          Record workflow
        </button>
      </div>
      <p className="meta">v0.3.7 — scaffold only</p>
    </main>
  );
}
