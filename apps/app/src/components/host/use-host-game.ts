import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {redirect} from '@tanstack/react-router'
import {TRPCClientError} from '@trpc/client'
import type {AnswerMode} from '@whocards/game'

import {trpc} from '~/lib/trpc'
import {roleAtLeast} from '~/server/auth/permissions'
import type {CurrentMember} from '~/server/auth/session'
import type {GameDetail} from '~/server/trpc/routers/games'

const LIVE_REFRESH_MS = 4000

export type Run = (id: string, fn: () => Promise<GameDetail | null>, onDone?: () => void) => void

/** `beforeLoad` for every host page of one game. */
export const requireHost = ({context}: {context: Pick<CurrentMember, 'membership'>}) => {
  if (!context.membership || !roleAtLeast(context.membership.role, 'facilitator')) {
    throw redirect({to: '/'})
  }
}

// The server answers CONFLICT when another host moved the game on (a lost race or a stale write).
export const isConflict = (error: Error) =>
  error instanceof TRPCClientError && error.data?.code === 'CONFLICT'

export const ANSWER_MODES: Record<AnswerMode, {label: string; hint: string}> = {
  voice: {
    label: 'Voice',
    hint: 'Players record; answers turn into text and save in the background.',
  },
  type: {label: 'Type', hint: 'No mic. Players type their answer.'},
  none: {label: 'None', hint: 'Nothing captured. Phones only pace turns.'},
}

/** The polled game detail plus one-at-a-time host actions keyed by `busy`. */
export const useHostGame = (gameId: string) => {
  const queryClient = useQueryClient()
  const key = ['games.detail', gameId]
  const detail = useQuery({
    queryKey: key,
    queryFn: () => trpc.games.detail.query({gameId}),
    refetchInterval: (query) => {
      const game = query.state.data?.game
      const sending = game?.recap?.pending || game?.revisit?.pending
      return game?.status === 'ended' && !sending ? false : LIVE_REFRESH_MS
    },
  })
  const act = useMutation({
    mutationFn: (action: {id: string; fn: () => Promise<GameDetail | null>}) => action.fn(),
    onMutate: () => queryClient.cancelQueries({queryKey: key}),
    onSuccess: async (data) => {
      // A poll that started before the write would land after it and flash the old state back.
      await queryClient.cancelQueries({queryKey: key})
      if (data) queryClient.setQueryData(key, data)
    },
    onError: (error) => {
      if (isConflict(error)) void queryClient.invalidateQueries({queryKey: key})
    },
  })
  const busy = act.isPending ? act.variables.id : null
  const run: Run = (id, fn, onDone) => {
    if (act.isPending) return
    act.mutate({id, fn}, {onSuccess: onDone})
  }

  const goLive = () => {
    const ok = window.confirm('Go live? Players can join with the code from now on.')
    if (ok) run('go-live', () => trpc.games.goLive.mutate({gameId}))
  }
  const endGame = () => {
    const ok = window.confirm(
      'End the game? Any live round stops and players can no longer play. You preview the recap email next and send it when ready.'
    )
    if (ok) run('end-game', () => trpc.games.endGame.mutate({gameId}))
  }
  const startRound = (roundId: string) =>
    run(`start:${roundId}`, () => trpc.games.startRound.mutate({gameId, roundId}))
  const endRound = (roundId: string) =>
    run(`end:${roundId}`, () => trpc.games.endRound.mutate({gameId, roundId}))
  const setAnswerMode = (mode: AnswerMode) =>
    run(`mode:${mode}`, () => trpc.games.setAnswerMode.mutate({gameId, mode}))

  return {
    key,
    detail,
    act,
    busy,
    run,
    goLive,
    endGame,
    startRound,
    endRound,
    setAnswerMode,
    pendingMode: busy?.startsWith('mode:') ? busy.slice('mode:'.length) : null,
  }
}
