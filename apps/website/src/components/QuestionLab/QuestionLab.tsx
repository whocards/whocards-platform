import {useState} from 'react'
import {QUESTION_LAB_MODELS} from '~server/question-lab/models'
import {
  ACTS,
  CANONICAL_PROMPT,
  HOUSE_DIRECTIONS,
  questionIdsForAct,
} from '~server/question-lab/prompt'
import type {QuestionLabDeck} from '~server/question-lab/prompt'
import {cn} from '~utils'

type RunResult = {
  runId: string
  model: string
  direction: string
  latencyMs: number | null
  usage: {inputTokens: number | null; outputTokens: number | null}
  rawText: string
  deck: QuestionLabDeck | null
  parseError: string | null
  requestError?: string
}

let runCounter = 0

const copyDeckJson = async (deck: QuestionLabDeck) => {
  await navigator.clipboard.writeText(JSON.stringify(deck, null, 2))
}

const RunColumn = ({result}: {result: RunResult}) => (
  <div className='flex w-80 shrink-0 flex-col gap-3 rounded-xl border border-white/10 bg-black/30 p-4'>
    <div className='flex items-center justify-between gap-2'>
      <h3 className='font-title text-lg font-bold text-white'>{result.model}</h3>
      {result.latencyMs !== null && (
        <span className='text-xs text-white/50'>{(result.latencyMs / 1000).toFixed(1)}s</span>
      )}
    </div>
    <div className='text-xs text-white/50'>direction: {result.direction || '(none)'}</div>
    {(result.usage.inputTokens !== null || result.usage.outputTokens !== null) && (
      <div className='text-xs text-white/50'>
        in: {result.usage.inputTokens ?? '—'} · out: {result.usage.outputTokens ?? '—'}
      </div>
    )}

    {result.requestError && <p className='text-sm text-red-400'>{result.requestError}</p>}

    {!result.requestError && result.parseError && (
      <div className='flex flex-col gap-2'>
        <p className='text-sm text-red-400'>Parse failed: {result.parseError}</p>
        <pre className='max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-2 text-xs text-white/70'>
          {result.rawText}
        </pre>
      </div>
    )}

    {!result.requestError && !result.parseError && result.deck && (
      <div className='flex flex-col gap-3'>
        <button
          type='button'
          onClick={() => result.deck && copyDeckJson(result.deck)}
          className='self-start rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/20'
        >
          Copy deck JSON
        </button>
        <div className='flex max-h-[32rem] flex-col gap-4 overflow-auto'>
          {ACTS.map((act) => (
            <div key={act.id} className='flex flex-col gap-2'>
              <h4 className='text-xs font-semibold uppercase tracking-wide text-white/50'>
                {act.label}
              </h4>
              {questionIdsForAct(act).map((id) => (
                <div key={id} className='rounded-lg bg-white/5 p-2 text-sm text-white/90'>
                  <span className='mr-1 text-white/40'>{id}</span>
                  {result.deck?.[id]?.en}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
)

export const QuestionLab = () => {
  const [prompt, setPrompt] = useState(CANONICAL_PROMPT)
  const [direction, setDirection] = useState(HOUSE_DIRECTIONS[0].description)
  const [selectedModels, setSelectedModels] = useState<string[]>([QUESTION_LAB_MODELS[0].id])
  const [running, setRunning] = useState(false)
  const [runs, setRuns] = useState<RunResult[]>([])

  const toggleModel = (id: string) => {
    setSelectedModels((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]))
  }

  const runOne = async (model: string): Promise<RunResult> => {
    const runId = `run-${++runCounter}`
    try {
      const res = await fetch('/api/dev/question-lab', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({prompt, direction, model}),
      })
      const data = await res.json()
      if (!res.ok) {
        return {
          runId,
          model,
          direction,
          latencyMs: null,
          usage: {inputTokens: null, outputTokens: null},
          rawText: '',
          deck: null,
          parseError: null,
          requestError: data.error ?? `Request failed (${res.status}).`,
        }
      }
      return {
        runId,
        model: data.model ?? model,
        direction,
        latencyMs: data.latencyMs ?? null,
        usage: data.usage ?? {inputTokens: null, outputTokens: null},
        rawText: data.rawText ?? '',
        deck: data.deck ?? null,
        parseError: data.parseError ?? null,
      }
    } catch (error) {
      return {
        runId,
        model,
        direction,
        latencyMs: null,
        usage: {inputTokens: null, outputTokens: null},
        rawText: '',
        deck: null,
        parseError: null,
        requestError: error instanceof Error ? error.message : 'Request failed.',
      }
    }
  }

  const handleRun = async () => {
    if (selectedModels.length === 0 || running) return
    setRunning(true)
    try {
      const results = await Promise.all(selectedModels.map(runOne))
      setRuns((prev) => [...prev, ...results])
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className='mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10'>
      <header className='flex flex-col gap-2'>
        <h1 className='animate-pulse bg-gradient-to-r from-fuchsia-400 via-cyan-300 to-amber-300 bg-clip-text font-title text-4xl font-extrabold uppercase tracking-tight text-transparent md:text-6xl'>
          Question Lab
        </h1>
        <p className='max-w-2xl text-sm text-white/60'>
          Dev-only benchmark for the AI Check-In question-generation prompt. Tweak the prompt and
          direction, run it against several models side by side, and pick a winning variant to paste
          into a deck file. Never shipped to production.
        </p>
      </header>

      <section className='flex flex-col gap-3'>
        <label htmlFor='ql-prompt' className='text-sm font-semibold text-white/80'>
          Prompt
        </label>
        <textarea
          id='ql-prompt'
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={14}
          className='w-full rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-xs text-white/90'
        />
      </section>

      <section className='flex flex-col gap-3'>
        <label htmlFor='ql-direction' className='text-sm font-semibold text-white/80'>
          Direction
        </label>
        <input
          id='ql-direction'
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          className='w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/90'
        />
        <div className='flex flex-wrap gap-2'>
          {HOUSE_DIRECTIONS.map((d) => (
            <button
              key={d.id}
              type='button'
              onClick={() => setDirection(d.description)}
              className='rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/20'
            >
              {d.label}
            </button>
          ))}
        </div>
      </section>

      <section className='flex flex-col gap-3'>
        <span className='text-sm font-semibold text-white/80'>Models</span>
        <div className='flex flex-wrap gap-2'>
          {QUESTION_LAB_MODELS.map((m) => (
            <button
              key={m.id}
              type='button'
              onClick={() => toggleModel(m.id)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold',
                selectedModels.includes(m.id)
                  ? 'bg-fuchsia-500 text-white'
                  : 'bg-white/10 text-white/70'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </section>

      <button
        type='button'
        onClick={handleRun}
        disabled={running || selectedModels.length === 0}
        className='self-start rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-6 py-3 font-bold text-black disabled:opacity-50'
      >
        {running ? 'Running…' : 'Run'}
      </button>

      {runs.length > 0 && (
        <section className='flex gap-4 overflow-x-auto pb-4'>
          {runs.map((result) => (
            <RunColumn key={result.runId} result={result} />
          ))}
        </section>
      )}
    </div>
  )
}

export default QuestionLab
