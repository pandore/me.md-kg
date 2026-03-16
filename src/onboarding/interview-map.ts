export interface InterviewAngle {
  id: string;
  label: string;
  description: string;
  questionFocus: string;
}

export const DEFAULT_ANGLES: InterviewAngle[] = [
  {
    id: 'journey',
    label: 'Journey',
    description: 'Your path and how you got here',
    questionFocus: 'Timeline, key transitions, turning points, origin stories',
  },
  {
    id: 'principles',
    label: 'Principles',
    description: 'What guides your decisions and actions',
    questionFocus: 'Values, beliefs, non-negotiables, philosophy',
  },
  {
    id: 'frameworks',
    label: 'Frameworks',
    description: 'How you think about and approach problems',
    questionFocus: 'Mental models, decision-making processes, analytical approaches',
  },
  {
    id: 'examples',
    label: 'Examples',
    description: 'Concrete stories that illustrate who you are',
    questionFocus: 'Specific situations, anecdotes, case studies from your life',
  },
  {
    id: 'tensions',
    label: 'Tensions',
    description: 'Contradictions and tradeoffs you navigate',
    questionFocus: 'Internal conflicts, competing values, nuanced positions',
  },
];
