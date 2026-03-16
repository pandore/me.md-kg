export type Methodology = 'clean_language' | 'socratic' | 'five_whys' | 'appreciative_inquiry' | 'micro_phenomenology';

export const METHODOLOGY_DESCRIPTIONS: Record<Methodology, string> = {
  clean_language: `Clean Language: Use the user's exact words in your reflections and questions. Ask "And what kind of [X] is that [X]?", "And is there anything else about [X]?", "And where is [X]?", "And what would you like to have happen?". Avoid introducing your own metaphors — mirror the user's language precisely.`,
  socratic: `Socratic Method: Examine assumptions through questioning. Ask "What evidence supports this?", "What would someone who disagrees say?", "What assumptions are you making?".`,
  five_whys: `Five Whys: Dig beneath surface answers. Ask "Why does that matter to you?", "What's driving that at a deeper level?", "What's underneath that feeling/belief?".`,
  appreciative_inquiry: `Appreciative Inquiry: Focus on strengths and peak experiences. Ask "When is this at its best?", "What strengths do you bring?", "What would the ideal look like?".`,
  micro_phenomenology: `Micro-Phenomenology: Explore the texture of lived experience. Ask "What's the very first thing you notice?", "What does that feel like in your body?", "Walk me through that moment in slow motion.".`,
};

export function selectMethodology(messageCount: number, intent: string): Methodology {
  const sequences: Record<string, Methodology[]> = {
    articulate: ['clean_language', 'micro_phenomenology', 'socratic', 'appreciative_inquiry', 'five_whys'],
    explore: ['appreciative_inquiry', 'socratic', 'clean_language', 'micro_phenomenology', 'five_whys'],
    decide: ['socratic', 'five_whys', 'clean_language', 'appreciative_inquiry', 'micro_phenomenology'],
    document: ['micro_phenomenology', 'clean_language', 'appreciative_inquiry', 'socratic', 'five_whys'],
  };
  const seq = sequences[intent] || sequences['explore'];
  return seq[messageCount % seq.length];
}
