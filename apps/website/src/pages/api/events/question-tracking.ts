import type {APIRoute} from 'astro'
import {eq} from 'drizzle-orm'
import {z} from 'zod'
import {db} from '~server/db'
import {conference, conferenceQuestionTracking} from '~server/db/schema'

export const prerender = false

const zEvent = z.object({
  eventId: z.number(),
  userId: z.string().optional(),
  questionId: z.number().or(z.string()),
  type: z.string(),
  language: z.string(),
})

export const POST: APIRoute = async ({request}) => {
  const body = await request.json()
  const data = zEvent.safeParse(body)

  if (!data.success) {
    return new Response(data.error.toString(), {status: 400})
  }

  const {eventId, userId: user, questionId: rawQuestionId, type, language} = data.data

  // if (process.env.NODE_ENV === 'development') {
  //   console.log('question-tracking', data.data)
  //   return new Response(JSON.stringify({message: 'Success', code: 201}), {status: 201})
  // }

  const questionId = Number(rawQuestionId)

  if (isNaN(questionId) || !questionId) {
    return new Response(JSON.stringify({message: 'Invalid question ID', code: 400}), {status: 400})
  }

  const {message, code} = await db.transaction(async (tx) => {
    const currentConference = await tx.query.conference.findFirst({
      where: eq(conference.id, eventId),
    })

    if (!currentConference) {
      return {message: 'Conference not found', code: 404}
    }

    // if (!currentConference.isActive) {
    //   return {message: 'Conference is not active', code: 400}
    // }

    const [res] = await tx
      .insert(conferenceQuestionTracking)
      .values({
        conferenceId: currentConference.id,
        questionId,
        type,
        user,
        language,
      })
      .returning({id: conferenceQuestionTracking.id})

    console.log(res)

    if (!res) {
      console.error('Failed to insert question tracking', res)
      return {message: 'Failed to insert question tracking', code: 500}
    }

    return {message: `Success ${res.id}`, code: 201}
  })

  return new Response(JSON.stringify({message}), {status: code})
}
