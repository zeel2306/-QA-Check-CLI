export interface IssueSuggestion {
  code: string;
  title: string;
  problem: string;
  whyItMatters?: string;
  suggestedFix: string[];
  shortFix: string;
}

export type SuggestionMap = Record<string, IssueSuggestion>;
