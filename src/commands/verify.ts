import { getUnverifiedBatch, markVerified, markRejected, editAndVerify } from '../core/verification.js';

interface VerifyOptions {
  confirmIds?: string;
  rejectIds?: string;
  editId?: string;
  editText?: string;
  all?: boolean;
}

export function verify(opts: VerifyOptions) {
  // If confirm/reject/edit actions provided, process them
  if (opts.confirmIds || opts.rejectIds || opts.editId) {
    let confirmed = 0;
    let rejected = 0;
    let edited = 0;

    if (opts.confirmIds) {
      const ids = opts.confirmIds.split(',').map(s => s.trim());
      for (const id of ids) {
        try {
          markVerified(id);
          confirmed++;
        } catch (e: any) {
          console.error(`[verify] Failed to confirm ${id}: ${e.message}`);
        }
      }
    }

    if (opts.rejectIds) {
      const ids = opts.rejectIds.split(',').map(s => s.trim());
      for (const id of ids) {
        try {
          markRejected(id);
          rejected++;
        } catch (e: any) {
          console.error(`[verify] Failed to reject ${id}: ${e.message}`);
        }
      }
    }

    if (opts.editId && opts.editText) {
      try {
        editAndVerify(opts.editId, opts.editText);
        edited++;
      } catch (e: any) {
        console.error(`[verify] Failed to edit ${opts.editId}: ${e.message}`);
      }
    }

    return {
      ok: true as const,
      data: {
        message: `Processed: ${confirmed} confirmed, ${rejected} rejected, ${edited} edited`,
        confirmed,
        rejected,
        edited,
      },
    };
  }

  // Otherwise, show unverified batch
  const batch = getUnverifiedBatch(5, opts.all);

  if (batch.length === 0) {
    return {
      ok: true as const,
      data: { message: 'No unverified facts to review!', facts: [] },
    };
  }

  return {
    ok: true as const,
    data: {
      message: `Knowledge Review (${batch.length} facts to verify):`,
      facts: batch.map((r, i) => ({
        index: i + 1,
        id: r.id,
        fact: `${r.source_name} → ${r.relation_type} → ${r.target_name}`,
        summary: r.summary,
        confidence: r.confidence,
      })),
      instructions: 'Use --confirm <id1,id2,...> to confirm, --reject <id1,id2,...> to reject, or --edit <id> "new text" to edit',
    },
  };
}
