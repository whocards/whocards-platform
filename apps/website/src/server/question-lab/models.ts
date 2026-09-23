// Candidate models for the dev-only Question Lab benchmark. Kept as a plain
// constant so the list is trivial to edit as Anthropic ships new models —
// verify ids against https://docs.anthropic.com before adding one.
export type QuestionLabModel = {
  id: string
  label: string
}

export const QUESTION_LAB_MODELS: QuestionLabModel[] = [
  {id: 'claude-sonnet-5', label: 'Claude Sonnet 5'},
  {id: 'claude-opus-4-8', label: 'Claude Opus 4.8'},
  {id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5'},
]

export const ANTHROPIC_API_VERSION = '2023-06-01'
export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
export const QUESTION_LAB_MAX_TOKENS = 4000
