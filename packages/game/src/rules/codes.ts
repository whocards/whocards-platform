import {CODE_ALPHABET} from '../schemas'

/** `random` returns [0, 1); pass a crypto-backed one on the server. */
export const makeCode = (length: number, random: () => number): string =>
  Array.from({length}, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]).join('')
