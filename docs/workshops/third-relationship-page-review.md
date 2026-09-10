# The Third Relationship: copy and workshop direction review

Reviewed 9 September 2026. Scope: the copy in `apps/website/src/pages/third-relationship.astro`, checked against the workshop docs and the user's emerging priorities. The neighboring AI Check-In page was read for voice and product context. This is a source review, not visual browser QA. Website wording below remains proposed.

## Current direction: retain the third relationship

The latest prototype develops the original concept: **how someone's relationship with AI affects their relationships with people**. Slowing down supports the experience. Pressure and pace are possible themes within it. The earlier proposal below remains a record of an alternative; its copy findings about audience, duration, overpromising, and tone still apply.

Suggested page invitation for this direction:

> **Your relationship with AI is becoming part of your relationships with people.**
>
> A 90-minute WhoCards workshop to explore what that means in your working life. Through paired conversations and reflection, we'll make time to notice how we relate to AI and what that changes between us.

Explain the experience through the existing progression: meet through WhoCards, bring AI into the conversation, name the third relationship, and explore one experience with a partner. Describe the takeaway as recognizing a connection between one's experience of AI and a human interaction. A conversation or change may follow; it need not become another assignment.

The revised working agenda is in [first-prototype.md](first-prototype.md). It retains the seven-part structure, 90-minute duration, five-minute break, and closing feedback form. The website copy remains a proposal.

## Copy findings that apply to either direction

The page already uses relationship language. Its emphasis is exposing hidden dynamics, reaching difficult conversations, and producing feedback for the organization. That can make participation sound like an examination. The emerging workshop gives people time to notice their experience and hear one another.

The current page invites whole teams to a free 2–3-hour prototype. The first prototype is a 90-minute mixed group. If this page recruits for that first event, its audience, duration, CTA, and email body all need to change together. If it remains a separate team-service page, it needs to say so and provide a distinct route to the mixed-group prototype. Avoid combining both in one main application flow.

Recommendation: make the first event the main offer, with a smaller invitation for people interested in bringing this to their team later. Keep date, venue, delivery format, and capacity out of promises until confirmed.

Locations refer to `apps/website/src/pages/third-relationship.astro` as reviewed. All suggested wording is provisional.

### Match the promise to the actual experience

| Severity | Location                                                                                                   | Before                                                                                       | After / proposed change                                                                                                                                                                                                      | Why                                                                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH     | `apps/website/src/pages/third-relationship.astro:38`, `:61`, `:78`, `:116`, `:132`, `:151`, `:423`, `:491` | A 2–3-hour team offer throughout metadata, hero, audience, logistics, and email application. | For the first event: a 90-minute workshop for people from different workplaces. Use “Express interest” while logistics remain open; request a name and what brings the person to the workshop. Keep team enquiries separate. | Readers need to know whether they can attend alone and what commitment they are making. The button must accurately describe the email enquiry it opens.                                |
| HIGH     | `apps/website/src/pages/third-relationship.astro:53`, `:72`, `:379`                                        | A live upward feedback channel, shared team baseline, and a required debrief afterward.      | Describe an opportunity to feel heard and name something to discuss at work. State that the session ends with a short feedback form; offer later follow-up as optional unless agreed otherwise.                              | A temporary mixed group cannot create an employer's feedback channel, and the page's participation obligation differs from the draft.                                                  |
| HIGH     | `apps/website/src/pages/third-relationship.astro:247`                                                      | “That's factorial growth, managed by nobody.”                                                | Remove the numeric growth claim and five-relationship count. Explain that personal AI use can affect interactions with colleagues.                                                                                           | The diagram provides no defined counting model. Ordinary pairwise relationship counts grow quadratically, not factorially. The apparent precision distracts from the human experience. |

### Describe the experience without deciding it for the reader

| Severity | Location                                                                      | Before                                                                                                   | After / proposed change                                                                                                                       | Why                                                                                                                  |
| -------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| MEDIUM   | `apps/website/src/pages/third-relationship.astro:46`, `:132`, `:251`          | Nobody is aware; everyone's use is private; nobody compares notes.                                       | “People can experience the same change very differently. This is time to compare notes.”                                                      | Universal claims exclude people who are already talking or using AI openly.                                          |
| MEDIUM   | `apps/website/src/pages/third-relationship.astro:257`, `:276`, `:288`         | Adoption is a relational problem; teams fail because disagreement goes underground; the gap isn't skill. | Describe relationships as this workshop's focus. Leave room for skill gaps, incentives, genuine disagreement, and organizational constraints. | A chosen focus does not require an exclusive explanation for every workplace problem.                                |
| MEDIUM   | `apps/website/src/pages/third-relationship.astro:110`, `:139`, `:268`, `:298` | The harder conversation; go where it is hardest; friction is missing; hidden blind spots.                | “Time to notice what's happening, listen to another experience, and make room for what matters to you.”                                       | Depth should develop through participation. Promising intensity can pressure people to disclose more than they want. |

### Use concrete language and credible authority

| Severity | Location                                                      | Before                                                                                        | After / proposed change                                                                                               | Why                                                                                                                                                                                   |
| -------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MEDIUM   | `apps/website/src/pages/third-relationship.astro:104`, `:306` | Capacity-building, capacity experience, somatic groundwork that makes truth-telling possible. | “A brief optional pause, WhoCards conversations in pairs, and guided reflection.”                                     | Tell a prospective participant what they will do. The current causal promise exceeds what a brief grounding activity can establish.                                                   |
| MEDIUM   | `apps/website/src/pages/third-relationship.astro:84`          | Long founder narratives and a claim that nobody owns honest team conversation.                | Short, verified introductions: each person's role in hosting, relevant experience, and why they care about this work. | Authority can come from specific experience without claiming the entire problem is unattended. Verify biographical specifics before publication; this review does not establish them. |

## Suggested page structure

1. **Invitation and practical fit.** Name the experience, its 90-minute duration, and the fact that people attend from different workplaces. Put the main enquiry action here.
2. **Recognizable experience.** Describe how someone turns to AI and what that can change in an interaction with another person. Include room for relief or enjoyment. Avoid a long catalogue of problems.
3. **What happens in the room.** Explain that people pause, talk in pairs, and listen; a five-minute break and a short feedback form belong in the practical details. Use a compact sequence rather than the current long explanatory sections.
4. **What people might take away.** Better language for their experience and something they want to protect or discuss at work. Describe opportunities rather than a guaranteed change in trust or wellbeing.
5. **Hosts, participation, and joining.** Brief biographies, permission to pass, no prior AI expertise required, and confirmed event details. A secondary enquiry can cover future team sessions.

Keep the WhoCards identity and recognizable visual style. Reduce repeated urgency, repeated application blocks, and the amount of theory before the experience becomes clear. This is a proposal about information order; a later visual review should check the rendered page.

Retain “The Third Relationship” as the workshop name. Explain it as how the way someone relates to AI can affect their relationships with other people. Treat this as a useful perspective participants can question. Some participants may also want to consider attention, reliance, and boundaries in their direct use of AI without regarding it as a person.

## Earlier alternative: pressure and pace

The earlier recommendation focused the prototype on how the pressure to keep up with AI affects attention and working relationships. It replaced the 25-minute group case analysis with paired listening and made a clearer need or a conversation a possible takeaway. Those listening and takeaway choices inform the current prototype, while the original third relationship supplies its central focus.

Earlier hero direction, retained for comparison:

> **Make space for each other in the rush to adopt AI.**
>
> A 90-minute WhoCards workshop to slow down and talk about how AI is changing our working lives. Share your experience, listen to someone else's, and notice what you want to protect in your relationships with people and AI.
>
> Come as you are. You don't need to use AI, work with the other participants, or have a settled opinion about it.

### Earlier six-part agenda for comparison

This alternative combined definitions with the AI conversation. It is not the current seven-part prototype agenda.

| Time  | Part                           | Purpose and scope                                                                                                                                                                                                 |
| ----- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–10  | Arrive                         | Brief welcome, optional grounding, purpose, and participation choices.                                                                                                                                            |
| 10–25 | Meet through WhoCards          | One general Question in pairs, with a few voluntary observations. Practise giving someone unhurried attention.                                                                                                    |
| 25–45 | AI and the pressure to keep up | Private reflection and one AI-focused round. Give no more than a few minutes to the shared framing; name only tensions participants recognize.                                                                    |
| 45–50 | Break                          | Five minutes.                                                                                                                                                                                                     |
| 50–75 | Stay with an experience        | Continue in pairs so each person has room for their own situation. Describe what happened, hear it reflected back, and identify what mattered. Use clarifying questions before advice; no group process redesign. |
| 75–90 | Take something back and close  | Five minutes to write, four for paired reflection, three for voluntary closing shares, three for the feedback form. A takeaway may be a need, a boundary, or a conversation.                                      |

Its proposed 25-minute core allowed four minutes to choose and reflect privately, fourteen for paired listening with seven per person, five for personal reflection, and two to note a voluntary theme. These are pilot choices, not research-prescribed timings.

## Priorities and limits

**Put at the center:** recognizing a connection between one's relationship with AI and a human interaction, with enough time to hear another person's experience.

**Keep available:** pressure, uncertainty about value, being judged, and changes in trust or connection. Let these emerge through participant experience.

**Defer:** process repair, AI techniques, a complete map of the team's relationships, and agreement about the economic merits of speed. These require different participants, more context, or a longer session.

Slowing down is a condition we can create in the workshop, while healthy relationships are a longer-term aspiration. Define health through observable experiences such as being able to ask for time, question an output, disagree, or seek another person's help. Don't promise that one session produces it.

The idea that short-term output may crowd out relationship care is worth exploring, but neither that tradeoff nor “processes break faster than we can repair them” should become a universal assertion in the copy. The research includes both work intensification and time savings in different contexts; it does not settle their net effect on relationships. See the [evidence and limits](comparable-workshops-and-ai-tensions.md).

Use `whocards-questions` to generate the actual Questions. The [research note](comparable-workshops-and-ai-tensions.md) supplies a vocabulary for the hosts, not additional agenda items. A practical next step can follow a clearer understanding without becoming a required workshop output.

**Block publication of the current copy as the first-prototype offer** until the audience, duration, promises, and unsupported relationship-count claim are corrected. This assessment applies only to the inspected copy; it is not a request to stop the exploratory work.
