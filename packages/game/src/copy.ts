import type {GameLanguage, PlayerPhase, Refusal} from './schemas'

export type GameCopy = {
  refusals: Record<Refusal, string>
  phases: Record<PlayerPhase, string>
  actions: {join: string; pair: string; claim: string; finish: string; save: string; skip: string}
}

const en: GameCopy = {
  refusals: {
    unknown_game: 'No game with that code',
    not_open: "This workshop isn't open yet. Scan again when the host starts it",
    game_over: 'This game has ended',
    unknown_code: 'No player with that code',
    round_not_live: 'The round has not started',
    self: "That's your own code",
    already_paired: "You're already paired this round",
    partner_busy: 'They already have a partner',
    met_before: "You've met already. Find someone new",
    not_paired: 'Pair up first',
    partner_answering: 'Your partner is answering',
    already_answered: "You've already answered",
    no_open_turn: "You're not answering right now",
    not_your_turn: 'Not your turn',
    not_found: 'Not found',
    wrong_answer_mode: "This turn doesn't take that kind of answer",
    no_consent: 'You chose to play without saving answers',
  },
  phases: {
    waiting: 'Waiting for the next round',
    unpaired: 'Find someone new and scan their code',
    sitting_out: 'Sit this one out. Next round soon',
    ready: 'Tap to take your question',
    speaking: "You're answering",
    partner_speaking: 'Your partner is answering',
    answered: "Your partner's turn",
    pair_done: 'Done. Wait for the next round',
  },
  actions: {
    join: 'Join',
    pair: 'Pair up',
    claim: 'My turn',
    finish: 'Done',
    save: 'Save my answer',
    skip: "Don't save",
  },
}

// HU lands with the workshop copy pass; until then every language reads EN.
const byLanguage: Partial<Record<GameLanguage, GameCopy>> = {en}

export const copyFor = (language: GameLanguage): GameCopy => byLanguage[language] ?? en
