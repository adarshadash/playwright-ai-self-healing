export type By = 'id' | 'className' | 'cssSelector' | 'xpath' | 'name' | 'linkText';

export type Action =
  | { kind: 'goto'; url: string; raw: string }
  | { kind: 'fill'; by: By; value: string; text: string; raw: string }
  | { kind: 'click'; by: By; value: string; raw: string }
  | { kind: 'assertTextEquals'; by: By; value: string; expected: string; raw: string }
  | { kind: 'assertTextContains'; by: By; value: string; expected: string; raw: string }
  | { kind: 'sleep'; ms: number; raw: string }
  | { kind: 'unknown'; raw: string };

export interface LegacyTest {
  name: string;
  actions: Action[];
}

/** Output of the Analyzer agent: an intermediate representation of one Java file. */
export interface AnalyzedFile {
  file: string;
  className: string;
  tests: LegacyTest[];
  smells: string[];
}

export interface ReviewFinding {
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface MigrationResult {
  file: string;
  outputFile: string;
  converter: 'rules' | 'claude';
  tests: number;
  actions: number;
  unknownActions: number;
  sleepsRemoved: number;
  brittleLocatorsReplaced: number;
  findings: ReviewFinding[];
  reviewRounds: number;
}
