import type {QuestionIds} from '~types'
import questions from '~data/questions.json'

// create shuffled array list
function shuffle(ids: QuestionIds): void {
  let last = ids.length
  let idx
  while (last > 0) {
    idx = rand(last)
    swap(ids, idx, --last)
  }
}

const rand = (n: number) => 0 | (Math.random() * n)

function swap(ids: QuestionIds, i: number, j: number): QuestionIds {
  let q = ids[i]
  ids[i] = ids[j]
  ids[j] = q
  return ids
}

export function generateGame(): QuestionIds {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.keys widens to string[]; questions' keys are QuestionId by construction (QuestionId = keyof typeof questions).
  const ids = Object.keys(questions) as QuestionIds
  shuffle(ids)
  return ids
}
