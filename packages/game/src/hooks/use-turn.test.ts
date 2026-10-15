import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import type {AnswerSink, Recorder, WakeLock} from '../adapters'
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
    vote: vi.fn<GameClient['vote']>(),
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
  const answers = {add: vi.fn<AnswerSink<string>['add']>()}
  const useBoth = ({clock, recording}: Props) => {
    const session = useHostedGame({client, platform, joined: true})
    const turn = useTurn({
      session,
      recorder: recording ? recorder : null,
      wakeLock,
      answers: recording ? answers : null,
      clock,
    })
    return {session, turn}
  }
  const hook = await renderHook(useBoth, props)
  await flush()
  return {client, recorder, wakeLock, answers, hook}
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

  it('records, finishes, and hands the take to the background queue without stopping', async () => {
    const {client, recorder, wakeLock, answers, hook} = await setup()
    await flush(() => hook.current.turn.record())
    expect(recorder.start).toHaveBeenCalledOnce()
    expect(wakeLock.acquire).toHaveBeenCalledOnce()
    expect(hook.current.turn.stage).toBe('recording')

    await flush(() => hook.current.turn.finish())
    expect(wakeLock.release).toHaveBeenCalledOnce()
    expect(answers.add).toHaveBeenCalledExactlyOnceWith('t1', take)
    expect(answers.add.mock.invocationCallOrder[0]).toBeLessThan(
      client.turn.mock.invocationCallOrder[0] ?? 0
    )
    expect(client.turn).toHaveBeenCalledWith('finish')
    expect(client.response).not.toHaveBeenCalled()
    expect(hook.current.turn.stage).toBe('idle')
    expect(hook.current.turn.draft).toBeNull()
    await hook.unmount()
  })

  it('still queues the take when the finish call fails', async () => {
    const {client, answers, hook} = await setup()
    client.turn.mockRejectedValueOnce(new Error('offline'))
    await flush(() => hook.current.turn.record())
    await flush(() => hook.current.turn.finish())
    expect(answers.add).toHaveBeenCalledOnce()
    expect(hook.current.turn.notice).toBe('network')
    expect(hook.current.turn.stage).toBe('idle')
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

  it('marks the turn mic-blocked when the mic is refused, and still lets it finish', async () => {
    const {client, recorder, answers, hook} = await setup()
    recorder.start.mockRejectedValueOnce(new Error('NotAllowedError'))
    await flush(() => hook.current.turn.record())
    expect(hook.current.turn.stage).toBe('idle')
    expect(hook.current.turn.micBlocked).toBe(true)
    expect(hook.current.turn.notice).toBeNull()

    await flush(() => hook.current.turn.finish())
    expect(client.turn).toHaveBeenCalledWith('finish')
    expect(answers.add).not.toHaveBeenCalled()
    expect(hook.current.turn.micBlocked).toBe(false)
    await hook.unmount()
  })

  it('opens a blank typed answer on a Type turn and saves it without the mic', async () => {
    const {client, recorder, hook} = await setup()
    client.state.mockResolvedValue(speakingState({answerMode: 'type'}))
    await flush(4000)
    await flush()
    expect(hook.current.turn.stage).toBe('typing')
    expect(hook.current.turn.draft).toEqual({turnId: 't1'})

    await flush(() => hook.current.turn.record())
    expect(recorder.start).not.toHaveBeenCalled()

    await flush(() => hook.current.turn.save('typed answer'))
    expect(client.response).toHaveBeenCalledWith({
      turnId: 't1',
      language: 'en',
      transcript: 'typed answer',
      durationMs: 0,
      consent: true,
    })
    expect(hook.current.turn.stage).toBe('idle')
    await hook.unmount()
  })

  it('ends a Type turn when the player skips it, without reopening it', async () => {
    const {client, hook} = await setup()
    client.state.mockResolvedValue(speakingState({answerMode: 'type'}))
    await flush(4000)
    await flush()
    await flush(() => hook.current.turn.discard())
    expect(client.turn).toHaveBeenCalledWith('finish')
    expect(client.response).not.toHaveBeenCalled()
    await flush()
    expect(hook.current.turn.stage).toBe('idle')
    expect(hook.current.turn.draft).toBeNull()
    await hook.unmount()
  })

  it('never opens a text box on a Type turn for a player who opted out', async () => {
    const {client, hook} = await setup({clock: null, recording: false})
    client.state.mockResolvedValue(speakingState({answerMode: 'type'}))
    await flush(4000)
    await flush()
    expect(hook.current.turn.stage).toBe('idle')
    expect(hook.current.turn.draft).toBeNull()
    await flush(() => hook.current.turn.save('sneaky'))
    expect(client.response).not.toHaveBeenCalled()
    await flush(() => hook.current.turn.finish())
    expect(client.turn).toHaveBeenCalledWith('finish')
    await hook.unmount()
  })

  it('captures nothing on a None turn: no mic, Done just finishes', async () => {
    const {client, recorder, answers, hook} = await setup()
    client.state.mockResolvedValue(speakingState({answerMode: 'none'}))
    await flush(4000)
    await flush()
    expect(hook.current.turn.stage).toBe('idle')
    await flush(() => hook.current.turn.record())
    expect(recorder.start).not.toHaveBeenCalled()
    await flush(() => hook.current.turn.finish())
    expect(client.turn).toHaveBeenCalledWith('finish')
    expect(answers.add).not.toHaveBeenCalled()
    expect(client.response).not.toHaveBeenCalled()
    expect(hook.current.turn.stage).toBe('idle')
    await hook.unmount()
  })

  it('finishes by itself when the timer runs out mid-recording', async () => {
    const {client, recorder, answers, hook} = await setup()
    await flush(() => hook.current.turn.record())
    await hook.rerender({clock: over, recording: true})
    await flush()
    expect(recorder.stop).toHaveBeenCalledOnce()
    expect(client.turn).toHaveBeenCalledWith('finish')
    expect(answers.add).toHaveBeenCalledWith('t1', take)
    expect(hook.current.turn.stage).toBe('idle')
    await hook.unmount()
  })

  it('just finishes the turn on the decline path', async () => {
    const {client, answers, hook} = await setup({clock: null, recording: false})
    expect(hook.current.turn.canRecord).toBe(false)
    await flush(() => hook.current.turn.record())
    expect(hook.current.turn.stage).toBe('idle')
    await flush(() => hook.current.turn.finish())
    expect(client.turn).toHaveBeenCalledWith('finish')
    expect(answers.add).not.toHaveBeenCalled()
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
    const {client, recorder, answers, hook} = await setup()
    const mic = deferred<undefined>()
    recorder.start.mockReturnValueOnce(mic.promise)
    await flush(() => void hook.current.turn.record())
    client.state.mockResolvedValue(playerState({round: null, phase: 'waiting'}))
    await flush(4000)
    await flush(() => mic.resolve(undefined))
    expect(recorder.cancel).toHaveBeenCalledOnce()
    expect(answers.add).not.toHaveBeenCalled()
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

  it('keeps the take when the host ends the round mid-recording', async () => {
    const {client, recorder, answers, hook} = await setup()
    await flush(() => hook.current.turn.record())
    client.state.mockResolvedValue(playerState({round: null, phase: 'waiting'}))
    await flush(4000)
    await flush()
    expect(recorder.stop).toHaveBeenCalledOnce()
    expect(answers.add).toHaveBeenCalledWith('t1', take)
    expect(hook.current.turn.stage).toBe('idle')
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
