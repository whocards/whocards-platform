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
  }
  consent: {
    title: string
    transcript: string
    transcriptHint: string
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
  }
  screen: {
    joinAt: string
    round: string
    draft: string
    starting: string
    ended: string
    noCode: string
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
  },
  consent: {
    title: 'Before you play',
    transcript: 'Record my answers so I can save the text',
    transcriptHint: 'You read every answer before it is saved. Audio is not kept.',
    recap: 'Email me a recap tonight',
    email: 'Email',
    play: "Let's play",
    decline: 'Play without recording',
    back: 'Back',
  },
  // TODO(#317): final joint-controller wording from Avi and Tamas before the event.
  privacy: {
    title: 'Your data',
    lines: [
      'Avi Charlop and Tamas / Unloop run this game together and are joint controllers of your data.',
      'If you record, OpenAI turns your audio into text for us. The audio is not kept.',
      'An answer is stored only when you tap Save. Delete it any time in My answers.',
      'Your email is used only for the recap.',
      'Questions or deletion requests: hello@whocards.cc',
    ],
  },
  waiting: {firstRound: "You're in. The host starts soon", loading: 'Loading', retry: 'Try again'},
  pairing: {
    myCode: 'Your code',
    scan: 'Scan their code',
    stopScan: 'Stop scanning',
    typeCode: 'Or type their code',
    notACode: "That's not a player code",
    cameraOff: 'No camera. Type their code instead',
    partner: 'Talking with',
    codePlaceholder: 'ABC234',
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
  },
  screen: {
    joinAt: 'Scan to join',
    round: 'Round',
    draft: 'Not open yet',
    starting: 'Starting soon',
    ended: 'Thanks for playing',
    noCode: 'Add ?code=GAMECODE to the address',
    counts: {joined: 'joined', paired: 'paired', talking: 'talking', done: 'done'},
  },
}

// HU lands with the workshop copy pass; until then every language reads EN.
const byLanguage: Partial<Record<GameLanguage, PlayerCopy>> = {en}

export const playerCopyFor = (language: GameLanguage): PlayerCopy => byLanguage[language] ?? en
