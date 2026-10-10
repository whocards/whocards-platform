import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import type {Recorder, Transcriber, WakeLock} from '../adapters'
import type {TurnClock} from '../rules/timer'
import type {GameClient, GamePlatform} from './client'
import {flush, renderHook} from './render-hook.test-utils'
import {deferred, playerState, speakingState, trpcError} from './state.test-utils'
import {useHostedGame} from './use-hosted-game'
import {useTurn} from './use-turn'

type Props = {clock: TurnClock | null; recording: boolean}

const take = {audio: 'clip', mimeType: 'audio/webm', durationMs: 12_345.6}
const platform: GamePlatform = {isForeground: () => true, onForegroundChange: () => () => undefined}

const setup = async (props: Props = {clock: null, recording: true}) => {
  const client = {
    join: vi.fn<GameClient['join']>(),
    state: vi.fn<GameClient['state']>().mockResolvedValue(speakingState()),
    pair: vi.fn<GameClient['pair']>(),
    turn: vi.fn<GameClient['turn']>().mockResolvedValue(playerState({phase: 'answered'})),
    response: vi.fn<GameClient['response']>().mockResolvedValue(playerState({phase: 'answered'})),
    feedback: vi.fn<GameClient['feedback']>(),
  }
  const recorder = {
    start: vi.fn<Recorder<string>['start']>().mockResolvedValue(undefined),
    stop: vi.fn<Recorder<string>['stop']>().mockResolvedValue(take),
    cancel: vi.fn<Recorder<string>['cancel']>().mockResolvedValue(undefined),
  }
  const wakeLock = {
    acquire: vi.fn<WakeLock['acquire']>().mockResolvedValue(true),
    release: vi.fn<WakeLock['release']>().mockResolvedValue(undefined),
  }
  const transcriber = {
    transcribe: vi
      .fn<Transcriber<string>['transcribe']>()
      .mockResolvedValue({text: 'hello', language: 'en', model: 'fake'}),
  }
  const useBoth = ({clock, recording}: Props) => {
    const session = useHostedGame({client, platform, joined: true})
    const turn = useTurn({
      session,
      recorder: recording ? recorder : null,
      wakeLock,
      transcriber: recording ? transcriber : null,
      clock,
    })
    return {session, turn}
  }
  const hook = await renderHook(useBoth, props)
  await flush()
  return {client, recorder, wakeLock, transcriber, hook}
}

const over: TurnClock = {phase: 'over', remainingMs: 0, untilDeadlineMs: 0}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
})
afterEach(() => vi.useRealTimers())

describe('useTurn', () => {
  it('claims and shows the refusal when the partner was first', async () => {
    const {client, hook} = await setup()
    client.turn.mockRejectedValueOnce(trpcError({code: 'CONFLICT', refusal: 'partner_answering'}))
    await flush(() => hook.current.turn.claim())
    expect(client.turn).toHaveBeenCalledWith('claim')
    expect(hook.current.turn.notice).toBe('partner_answering')
    expect(hook.current.turn.stage).toBe('idle')
    await hook.unmount()
  })

  it('records, finishes, transcribes, and saves with explicit consent', async () => {
    const {client, recorder, wakeLock, transcriber, hook} = await setup()
    await flush(() => hook.current.turn.record())
    expect(recorder.start).toHaveBeenCalledOnce()
    expect(wakeLock.acquire).toHaveBeenCalledOnce()
    expect(hook.current.turn.stage).toBe('recording')

    await flush(() => hook.current.turn.finish())
    expect(wakeLock.release).toHaveBeenCalledOnce()
    expect(client.turn).toHaveBeenCalledWith('finish')
    expect(transcriber.transcribe).toHaveBeenCalledWith(take, 'en')
    expect(hook.current.turn.stage).toBe('review')
    expect(hook.current.turn.draft).toEqual({turnId: 't1', text: 'hello', durationMs: 12_345.6})

    await flush(() => hook.current.turn.save('hello, edited'))
    expect(client.response).toHaveBeenCalledWith({
      turnId: 't1',
      language: 'en',
      transcript: 'hello, edited',
      durationMs: 12_346,
      consent: true,
    })
    expect(hook.current.turn.stage).toBe('idle')
    expect(hook.current.turn.draft).toBeNull()
    await hook.unmount()
  })

  it('asks to keep the screen on when the wake lock is refused', async () => {
    const {wakeLock, hook} = await setup()
    wakeLock.acquire.mockResolvedValueOnce(false)
    await flush(() => hook.current.turn.record())
    expect(hook.current.turn.stage).toBe('recording')
    expect(hook.current.turn.notice).toBe('keep_screen_on')
    await hook.unmount()
  })

  it('stays put when the mic is unavailable', async () => {
    const {recorder, hook} = await setup()
    recorder.start.mockRejectedValueOnce(new Error('NotAllowedError'))
    await flush(() => hook.current.turn.record())
    expect(hook.current.turn.stage).toBe('idle')
    expect(hook.current.turn.notice).toBe('mic_unavailable')
    await hook.unmount()
  })

  it('keeps the recording for a retry when transcription fails', async () => {
    const {transcriber, hook} = await setup()
    transcriber.transcribe.mockRejectedValueOnce(new Error('502'))
    await flush(() => hook.current.turn.record())
    await flush(() => hook.current.turn.finish())
    expect(hook.current.turn.stage).toBe('review')
    expect(hook.current.turn.notice).toBe('transcribe_failed')
    expect(hook.current.turn.draft?.text).toBe('')

    await flush(() => hook.current.turn.retryTranscribe())
    expect(hook.current.turn.notice).toBeNull()
    expect(hook.current.turn.draft?.text).toBe('hello')
    await hook.unmount()
  })

  it('discards without sending and resyncs', async () => {
    const {client, hook} = await setup()
    await flush(() => hook.current.turn.record())
    await flush(() => hook.current.turn.finish())
    const reads = client.state.mock.calls.length
    await flush(() => hook.current.turn.discard())
    expect(client.response).not.toHaveBeenCalled()
    expect(hook.current.turn.stage).toBe('idle')
    expect(client.state.mock.calls.length).toBe(reads + 1)
    await hook.unmount()
  })

  it('finishes by itself when the timer runs out mid-recording', async () => {
    const {client, recorder, hook} = await setup()
    await flush(() => hook.current.turn.record())
    await hook.rerender({clock: over, recording: true})
    await flush()
    expect(recorder.stop).toHaveBeenCalledOnce()
    expect(client.turn).toHaveBeenCalledWith('finish')
    expect(hook.current.turn.stage).toBe('review')
    await hook.unmount()
  })

  it('just finishes the turn on the decline path', async () => {
    const {client, transcriber, hook} = await setup({clock: null, recording: false})
    expect(hook.current.turn.canRecord).toBe(false)
    await flush(() => hook.current.turn.record())
    expect(hook.current.turn.stage).toBe('idle')
    await flush(() => hook.current.turn.finish())
    expect(client.turn).toHaveBeenCalledWith('finish')
    expect(transcriber.transcribe).not.toHaveBeenCalled()
    expect(hook.current.turn.stage).toBe('idle')
    await hook.unmount()
  })

  it('starts the mic once on a double tap', async () => {
    const {recorder, hook} = await setup()
    const mic = deferred<undefined>()
    recorder.start.mockReturnValueOnce(mic.promise)
    await flush(() => {
      void hook.current.turn.record()
      void hook.current.turn.record()
    })
    expect(hook.current.turn.stage).toBe('starting')
    await flush(() => mic.resolve(undefined))
    expect(recorder.start).toHaveBeenCalledOnce()
    expect(hook.current.turn.stage).toBe('recording')
    await hook.unmount()
  })

  it('drops a mic that answers after the player already finished', async () => {
    const {client, recorder, wakeLock, hook} = await setup()
    const mic = deferred<undefined>()
    recorder.start.mockReturnValueOnce(mic.promise)
    await flush(() => void hook.current.turn.record())
    await flush(() => hook.current.turn.finish())
    expect(client.turn).toHaveBeenCalledWith('finish')
    expect(hook.current.turn.stage).toBe('idle')

    await flush(() => mic.resolve(undefined))
    expect(recorder.cancel).toHaveBeenCalledOnce()
    expect(wakeLock.acquire).not.toHaveBeenCalled()
    expect(hook.current.turn.stage).toBe('idle')
    await hook.unmount()
  })

  it('waits for a pending mic answer before starting a new take', async () => {
    const {client, recorder, hook} = await setup()
    const mic = deferred<undefined>()
    recorder.start.mockReturnValueOnce(mic.promise)
    client.turn.mockResolvedValueOnce(speakingState())
    await flush(() => void hook.current.turn.record())
    await flush(() => hook.current.turn.finish())
    await flush(() => void hook.current.turn.record())
    expect(recorder.start).toHaveBeenCalledOnce()
    expect(hook.current.turn.stage).toBe('idle')

    await flush(() => mic.resolve(undefined))
    expect(recorder.cancel).toHaveBeenCalledOnce()
    await flush(() => hook.current.turn.record())
    expect(recorder.start).toHaveBeenCalledTimes(2)
    expect(hook.current.turn.stage).toBe('recording')
    await hook.unmount()
  })

  it('drops a mic that answers after the turn already closed', async () => {
    const {client, recorder, transcriber, hook} = await setup()
    const mic = deferred<undefined>()
    recorder.start.mockReturnValueOnce(mic.promise)
    await flush(() => void hook.current.turn.record())
    client.state.mockResolvedValue(playerState({round: null, phase: 'waiting'}))
    await flush(4000)
    await flush(() => mic.resolve(undefined))
    expect(recorder.cancel).toHaveBeenCalledOnce()
    expect(transcriber.transcribe).not.toHaveBeenCalled()
    expect(hook.current.turn.stage).toBe('idle')
    await hook.unmount()
  })

  it('drops a mic that answers after the screen went away', async () => {
    const {recorder, wakeLock, hook} = await setup()
    const mic = deferred<undefined>()
    recorder.start.mockReturnValueOnce(mic.promise)
    await flush(() => void hook.current.turn.record())
    await hook.unmount()
    mic.resolve(undefined)
    await vi.runAllTimersAsync()
    expect(recorder.cancel).toHaveBeenCalledOnce()
    expect(wakeLock.acquire).not.toHaveBeenCalled()
  })

  it('keeps the take for review when the host ends the round mid-recording', async () => {
    const {client, recorder, hook} = await setup()
    await flush(() => hook.current.turn.record())
    client.state.mockResolvedValue(playerState({round: null, phase: 'waiting'}))
    await flush(4000)
    await flush()
    expect(recorder.stop).toHaveBeenCalledOnce()
    expect(hook.current.turn.stage).toBe('review')
    expect(hook.current.turn.draft?.turnId).toBe('t1')
    await hook.unmount()
  })

  it('stops the mic and wake lock if the screen goes away mid-recording', async () => {
    const {recorder, wakeLock, hook} = await setup()
    await flush(() => hook.current.turn.record())
    await hook.unmount()
    expect(recorder.cancel).toHaveBeenCalledOnce()
    expect(wakeLock.release).toHaveBeenCalledOnce()
  })
})
