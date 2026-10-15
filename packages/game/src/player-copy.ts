import type {GameLanguage} from './schemas'

/** Problems on the player's own device, as opposed to server refusals. */
export type DeviceNotice = 'keep_screen_on' | 'network'

export type PlayerCopy = {
  join: {
    title: string
    name: string
    namePlaceholder: string
    language: string
    languages: Record<GameLanguage, string>
    code: string
    next: string
    hostedBy: string
    standby: string
  }
  consent: {
    title: string
    transcript: string
    transcriptHint: string
    typed: string
    typedHint: string
    recap: string
    email: string
    play: string
    decline: string
    back: string
  }
  privacy: {title: string; lines: string[]}
  waiting: {firstRound: string; loading: string; retry: string}
  pairing: {
    myCode: string
    scan: string
    stopScan: string
    typeCode: string
    notACode: string
    cameraOff: string
    partner: string
    codePlaceholder: string
    pick: string
  }
  turn: {
    me: string
    record: string
    recording: string
    justTalk: string
    overtime: string
    answered: string
    notYet: string
    micBlocked: string
    micBlockedHint: string
    copyLink: string
    linkCopied: string
    rateQuestion: string
    voteUp: string
    voteDown: string
    physical: string
    physicalPartner: string
  }
  review: {
    title: string
    hint: string
    typeHint: string
    transcribing: string
    failed: string
    retry: string
    saving: string
  }
  feedback: {title: string; rating: string; text: string; send: string; thanks: string}
  notices: Record<DeviceNotice, string>
  mine: {
    title: string
    empty: string
    delete: string
    confirmDelete: string
    notJoined: string
    back: string
    link: string
    physical: string
  }
  screen: {
    joinAt: string
    round: string
    draft: string
    starting: string
    ended: string
    noCode: string
    orVisit: string
    code: string
    howTo: {title: string; steps: string[]; physicalStep: string}
    counts: {joined: string; paired: string; talking: string; done: string}
  }
}

const en: PlayerCopy = {
  join: {
    title: 'Join the game',
    name: 'Your name',
    namePlaceholder: 'Name or emoji',
    language: 'I answer in',
    languages: {en: 'English', hu: 'Magyar'},
    code: 'Game code',
    next: 'Next',
    hostedBy: 'Hosted by',
    standby: "You're joining as a facilitator on standby",
  },
  consent: {
    title: 'Before you play',
    transcript: 'Record my answers so I can save the text',
    transcriptHint: 'You read every answer before it is saved. Audio is not kept.',
    typed: 'Let me save my typed answers',
    typedHint: 'Nothing is kept until you tap Save.',
    recap: 'Email me a recap, and my questions to revisit later',
    email: 'Email',
    play: "Let's play",
    decline: 'Play without recording',
    back: 'Back',
  },
  privacy: {
    title: 'Your data',
    lines: [
      'WhoCards is responsible for your data.',
      'The workshop host sees only who joined, not your answers.',
      'If you record, OpenAI turns your audio into text for us. The audio is not kept.',
      'An answer is stored only when you tap Save. Delete it any time in My answers.',
      'Your email is used only for the recap and one follow-up with your questions.',
      'Answers and recap emails are deleted 90 days after the workshop.',
      'Questions or deletion requests: hello@whocards.cc',
    ],
  },
  waiting: {firstRound: "You're in. The host starts soon", loading: 'Loading', retry: 'Try again'},
  pairing: {
    myCode: 'Your code',
    scan: 'Scan their code',
    stopScan: 'Stop scanning',
    typeCode: 'Their code or name',
    notACode: "That's not a player code",
    cameraOff: 'No camera. Type their code or name instead',
    partner: 'Talking with',
    codePlaceholder: 'ABC234 or Anna',
    pick: 'Which one?',
  },
  turn: {
    me: 'You',
    record: 'Record',
    recording: 'Recording',
    justTalk: 'Just talk',
    overtime: "Time's up. Wrap up",
    answered: 'Answered',
    notYet: 'Not yet',
    micBlocked: 'Mic blocked. Open in Safari/Chrome',
    micBlockedHint:
      "This browser won't let the game use your mic, so this answer can't be saved. Talk anyway, then tap Done.",
    copyLink: 'Copy link',
    linkCopied: 'Link copied',
    rateQuestion: 'Rate this question',
    voteUp: 'Good question',
    voteDown: 'Not a good question',
    physical: 'Draw a card from the deck and read it out',
    physicalPartner: 'They draw a card from the deck',
  },
  review: {
    title: 'Your answer',
    hint: 'Fix anything before you save',
    typeHint: 'Type your answer',
    transcribing: 'Turning speech into text',
    failed: "Couldn't turn your answer into text",
    retry: 'Try again',
    saving: 'Saving',
  },
  feedback: {
    title: 'How was it?',
    rating: 'Rate the game',
    text: 'Anything to tell us? (optional)',
    send: 'Send',
    thanks: 'Thanks. See you next time',
  },
  notices: {
    keep_screen_on: 'Keep your screen on',
    network: 'Connection trouble. Try again',
  },
  mine: {
    title: 'My answers',
    empty: 'No saved answers yet',
    delete: 'Delete',
    confirmDelete: 'Tap again to delete',
    notJoined: 'Join a game first',
    back: 'Back to the game',
    link: 'My answers',
    physical: 'Physical card',
  },
  screen: {
    joinAt: 'Scan to join',
    round: 'Round',
    draft: 'Not open yet',
    starting: 'Starting soon',
    ended: 'Thanks for playing',
    noCode: 'Add ?code=GAMECODE to the address',
    orVisit: 'or go to',
    code: 'Game code',
    howTo: {
      title: 'How to play',
      steps: [
        'Join on your phone',
        'Find someone new and scan their code, or type their name',
        'Take turns answering the question',
      ],
      physicalStep: 'Draw a card and take turns answering',
    },
    counts: {joined: 'joined', paired: 'paired', talking: 'talking', done: 'done'},
  },
}

// HU lands with the workshop copy pass; until then every language reads EN.
const byLanguage: Partial<Record<GameLanguage, PlayerCopy>> = {en}

export const playerCopyFor = (language: GameLanguage): PlayerCopy => byLanguage[language] ?? en
