/**
 * AmplifyAnalyzer — turns a `WorkflowRecording` into an `AmplifiedRecording`
 * via the configured `LLMProvider`. v0.7.2 of the M6 path.
 *
 * The LLM returns the full `AmplifiedRecording` shape (happy + negatives);
 * the adapter validates against `AmplifiedRecordingSchema` before this method
 * returns. Schema-validation failures bubble as `LLMValidationError` — the
 * caller (CLI) maps those to an exit-2 error rather than emitting a broken
 * spec. See `prompt.ts` for the system + user prompt content.
 */
import type { LLMProvider } from '../../llm/provider.js';
import type { AmplifiedRecording, WorkflowRecording } from '../../types/analysis.js';
import { AmplifiedRecordingSchema } from '../../types/analysis.js';
import { SYSTEM_PROMPT, formatUserPrompt } from './prompt.js';

export class AmplifyAnalyzer {
  constructor(private readonly llm: LLMProvider) {}

  async amplify(recording: WorkflowRecording): Promise<AmplifiedRecording> {
    return this.llm.complete({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: formatUserPrompt(recording) }],
      schema: AmplifiedRecordingSchema,
      schemaName: 'AmplifiedRecording',
      schemaDescription:
        'A small focused set of Playwright scenarios — one happy (mirroring the recording exactly) plus 2–4 plausible negative variants. Selectors come verbatim from the recording.',
    });
  }
}
