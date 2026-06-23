# WhoCards — Store Listing Copy

> DRAFT — pending final assets, screenshots, and store records (issue #12).
> Do not submit until Phase 3 of docs/RELEASE.md is complete.

---

## App Name

**WhoCards**

---

## App Store Connect (iOS)

### Subtitle (max 30 characters)

```
Conversations that go deeper
```

### Promotional Text (max 170 characters, updatable without review)

```
Move past "What do you do?" and into who you really are. One question at a time, together.
```

### Description (max 4000 characters)

```
WhoCards is a conversation game built for real connection.

Each card is a question designed to move you past small talk and into the things that actually matter — what shaped you, what you care about, what makes you laugh, what keeps you up at night.

HOW IT WORKS

Pick up the WhoCards deck and swipe through questions together. Take turns, slow down when a question opens something up, and keep going for as long as the conversation feels alive.

PLAY ANYWHERE, IN ANY LANGUAGE

WhoCards is available in 14 languages, including right-to-left support for Hebrew. Switch language on the fly and your preference is remembered. Questions are written by humans, translated with care — not machine-generated filler.

OFFLINE READY

No signal? No problem. The full deck is included in the app, so you can keep playing wherever the conversation takes you.

SHARE A MOMENT

Found a question that stopped you in your tracks? Share its text directly from the app.

WHAT WE DON'T DO

No account required. No advertising. No tracking across other apps. No data sold. We collect only what's needed to operate and improve WhoCards: an anonymous device id, question activity, and privacy-conscious product analytics.

WhoCards is made by Alles ist Dialog, a cultural association based in Switzerland.

Questions? hello@whocards.cc
Privacy Policy: https://whocards.cc/legal/pp
```

### Keywords (max 100 characters, comma-separated)

```
conversation,icebreaker,questions,connection,game,social,party,team,dating,talk
```

### Primary Category

**Social Networking** (alternative: Entertainment)

### Secondary Category

**Games** → Party Games (alternative: Lifestyle)

### Support URL

```
https://whocards.cc/contact
```

### Support Email

```
hello@whocards.cc
```

### Marketing URL (optional)

```
https://whocards.cc
```

### Privacy Policy URL

```
https://whocards.cc/legal/pp
```

### Copyright

```
© 2025–2026 Alles ist Dialog - Verein für Kulturentwicklung
```

### Age Rating

4+ (no objectionable content; no user-generated content in v1.0)

---

## Google Play (Android)

### Short Description (max 80 characters)

```
Conversation cards that move you past small talk — 14 languages, offline play.
```

### Full Description (max 4000 characters)

```
WhoCards is a conversation game built for real connection.

Each card is a question designed to move you past small talk and into the things that actually matter — what shaped you, what you care about, what makes you laugh, what keeps you up at night.

HOW IT WORKS

Pick up the WhoCards deck and swipe through questions together. Take turns, slow down when a question opens something up, and keep going for as long as the conversation feels alive.

PLAY ANYWHERE, IN ANY LANGUAGE

WhoCards is available in 14 languages, including right-to-left support for Hebrew. Switch language on the fly and your preference is remembered. Questions are written by humans, translated with care — not machine-generated filler.

OFFLINE READY

No signal? No problem. The full deck is included in the app, so you can keep playing wherever the conversation takes you.

SHARE A MOMENT

Found a question that stopped you in your tracks? Share its text directly from the app.

WHAT WE DON'T DO

No account required. No advertising. No tracking across other apps. No data sold. We collect only what's needed to operate and improve WhoCards: an anonymous device id, question activity, and privacy-conscious product analytics.

WhoCards is made by Alles ist Dialog, a cultural association based in Switzerland.

Questions? hello@whocards.cc
Privacy Policy: https://whocards.cc/legal/pp
```

### Category

**Social** (alternative: Entertainment)

### Tags (Play allows up to 5)

```
conversation, icebreaker, party game, social, questions
```

### Contact Email

```
hello@whocards.cc
```

### Website

```
https://whocards.cc
```

### Privacy Policy URL

```
https://whocards.cc/legal/pp
```

### Content Rating

Everyone (IARC / ESRB)

---

## Screenshot Shot-List

> DRAFT — capture these on simulator/device before submitting.
> Required device sizes are listed below; use the Expo device matrix (docs/RELEASE.md).

### Screens to capture (same set for both platforms)

| #   | Screen                                      | Key elements visible                                     |
| --- | ------------------------------------------- | -------------------------------------------------------- |
| 1   | Landing / splash handoff                    | WhoCards logo, branded background, "Start" or deck entry |
| 2   | WhoCards Deck — question card (English)     | Full question text, card design, swipe affordance        |
| 3   | Language switcher open                      | Language list, current selection highlighted             |
| 4   | WhoCards Deck — question card (Hebrew, RTL) | Hebrew text right-aligned, RTL layout correct            |
| 5   | Share sheet                                 | Shared question text visible                             |

> Recommended: at least 5 screenshots for each store. Use the
> same shots for both stores, cropped to the required dimensions.

### iOS — Required device sizes (App Store Connect)

Provide screenshots for all required display types. Xcode Simulator can produce the correct
pixel dimensions.

| Display                                            | Points         | Required                               |
| -------------------------------------------------- | -------------- | -------------------------------------- |
| 6.9" (iPhone 16 Pro Max / iPhone 16 Plus)          | 1320 × 2868 px | Yes (required from 2024)               |
| 6.5" (iPhone 11 Pro Max / 12 Pro Max / 13 Pro Max) | 1284 × 2778 px | Yes (legacy required)                  |
| 5.5" (iPhone 8 Plus)                               | 1242 × 2208 px | Yes (if supporting iOS 15 and below)   |
| iPad Pro 13" (M4)                                  | 2064 × 2752 px | Required if listing as iPad-compatible |
| iPad Pro 12.9" (2nd/3rd gen)                       | 2048 × 2732 px | Required if listing as iPad-compatible |

> The 6.9" and 6.5" screenshots are displayed on the store page; the 5.5" is used as fallback
> for older device pages. Prioritise the 6.9" set for hero shots.

### Android — Required sizes (Google Play)

| Type                   | Size                                                             | Required                           |
| ---------------------- | ---------------------------------------------------------------- | ---------------------------------- |
| Phone screenshots      | min 320 px on short side, max 3840 px; aspect ratio 16:9 to 9:16 | 2–8 screenshots required           |
| 7" tablet screenshots  | same pixel rules as phone                                        | Required if targeting tablets      |
| 10" tablet screenshots | same pixel rules as phone                                        | Required if targeting tablets      |
| Feature graphic        | 1024 × 500 px                                                    | Required (shown above screenshots) |

> Use the Android emulator at 1080 × 2400 (420 dpi) for phone screenshots — covers most
> modern display sizes and produces clean pixel density.

### Feature Graphic / App Icon notes

- **iOS app icon:** 1024 × 1024 px, no alpha, no rounded corners (App Store applies the mask).
- **Android adaptive icon:** provide `ic_launcher_foreground.png` (108 × 108 dp safe zone)
  and `ic_launcher_background.png`; Expo manages this via `app.json` `android.adaptiveIcon`.
- **Play feature graphic:** 1024 × 500 px, used as the banner behind the first screenshot
  in the Play listing. Should carry the WhoCards logo and a brief tagline on brand background.

---

## App Privacy / Data Safety declarations

> Fill these forms in App Store Connect and Google Play Console to match the Privacy Policy
> at whocards.cc/legal/pp. Summary of what to declare:

### Apple App Privacy (App Store Connect)

| Data type                               | Collected         | Linked to identity | Used for tracking |
| --------------------------------------- | ----------------- | ------------------ | ----------------- |
| Device ID (anonymous, app-generated)    | Yes               | No                 | No                |
| Product interaction (PostHog analytics) | Yes               | No                 | No                |
| Crash data / diagnostics                | Yes (via PostHog) | No                 | No                |

- **Tracking:** No — do not check "track users across apps or websites owned by other companies."
- **Data linked to you:** None — the anonymous Device id is not linked to a name, email, or
  Apple ID.
- **NSUserTrackingUsageDescription:** Not required unless a tracking SDK is added in a future
  build. Do not add this key to `Info.plist` for v1.0.

### Google Play Data Safety

| Data type                                 | Collected | Shared | Encrypted in transit | User can request deletion    |
| ----------------------------------------- | --------- | ------ | -------------------- | ---------------------------- |
| App interactions (PostHog)                | Yes       | No     | Yes                  | No (aggregated)              |
| Device or other IDs (anonymous Device id) | Yes       | No     | Yes                  | Yes (by Device id via email) |

- **Cross-app tracking:** No.
- **Advertising ID (GAID):** Not used — do not declare it.
- **Data safety section:** Mark collection as "required for the app to function" for Device id;
  mark PostHog analytics as "optional — used to improve app performance."
