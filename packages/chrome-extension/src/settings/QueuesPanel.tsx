/**
 * v1.4 Queues panel — scaffold.
 *
 * Placeholder for the Queue composer. Real UI lands in later v1.4 patches:
 * a list of saved Queues, a composer for ordering Test Cases with per-step
 * `runAs` values + iterations, and a Save action that writes
 * `queue-N-{slug}.json` + `queue-N-{slug}.spec.ts` to the configured
 * Test repo folder. See `docs/10-team-shareability.md`.
 */
export function QueuesPanel(): JSX.Element {
  return (
    <section className="settings-panel" aria-labelledby="queues-heading">
      <p id="queues-heading" className="settings-tagline">
        Compose Test Cases into ordered <strong>Queues</strong>. Each step picks a Test Case and
        a <code>runAs</code> value; the Queue renders to a single Playwright spec your team
        can run from the shared repo.
      </p>

      <div className="settings-empty">
        <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Coming in v1.4</p>
        <p style={{ margin: 0 }}>
          Composer scaffolding is in place. List, composer, and Save-to-repo land in
          upcoming v1.3.x and v1.4.0 patches — see <code>docs/10-team-shareability.md</code>.
        </p>
      </div>
    </section>
  );
}
