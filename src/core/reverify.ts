/**
 * Classify a fact to determine its re-verification interval.
 * Ported from me.me-oss insights.ts:18-43
 */
export function classifyInterval(summary: string, confidence: number): string {
  const lower = summary.toLowerCase();

  const situationalPatterns = /\b(currently|right now|lately|recently|at the moment|these days|this week|this month|feeling|situation|context|today)\b/;
  const coreTraitPatterns = /\b(always|never|identity|core|fundamental|deeply|who i am|my nature|trait|personality|character|values?|believe|principle|philosophy)\b/;
  const preferencePatterns = /\b(prefer|like|enjoy|favorite|style|approach|tend to|usually|comfortable|dislike|hate|love|way i|how i)\b/;

  if (situationalPatterns.test(lower)) return 'weekly';
  if (coreTraitPatterns.test(lower) && confidence >= 0.75) return 'biannual';
  if (preferencePatterns.test(lower)) return 'quarterly';
  if (confidence >= 0.70) return 'quarterly';
  return 'monthly';
}

/**
 * Calculate re-verification date based on interval.
 * Ported from me.me-oss insights.ts:48-73
 */
export function calculateReVerifyAt(interval: string): string {
  const now = new Date();

  switch (interval) {
    case 'weekly':
      now.setDate(now.getDate() + 14);
      break;
    case 'monthly':
      now.setMonth(now.getMonth() + 1);
      break;
    case 'quarterly':
      now.setMonth(now.getMonth() + 3);
      break;
    case 'biannual':
      now.setMonth(now.getMonth() + 6);
      break;
    case 'annual':
      now.setFullYear(now.getFullYear() + 1);
      break;
    default:
      now.setMonth(now.getMonth() + 1);
      break;
  }

  return now.toISOString();
}
