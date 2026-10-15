export const confirmDeleteGame = (title: string) =>
  window.confirm(
    `Delete “${title}”? Every player’s saved answers are deleted for good and the recap email can no longer be sent. This cannot be undone.`
  )

export const confirmCopyGame = (title: string) =>
  window.confirm(
    `Copy “${title}” into a new draft? It keeps the organizer, questions, answer mode, rounds and co-facilitators, but no players or answers.`
  )

export const LIVE_DELETE_HINT = 'End the game to delete it.'
