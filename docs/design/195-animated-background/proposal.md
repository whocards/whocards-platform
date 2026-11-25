# 195: animated light-mode background (prototype)

Status: prototype behind `EXPO_PUBLIC_ANIMATED_BACKGROUND`, default off. Nothing ships until Avi has tried it on a device and picks a direction.

## Trying it

The flag is read when the JS bundle is built, so turning it on means a fresh bundle:

- Dev client: add `EXPO_PUBLIC_ANIMATED_BACKGROUND=true` to the root `.env`, then `pnpm dev:mobile --clear`.
- Release build on the simulator: `EXPO_PUBLIC_ANIMATED_BACKGROUND=true pnpm -F mobile with-env expo run:ios --configuration Release --device "WhoCards iPhone 17 Pro"`.

Switch Theme in Settings to see the crossfade. To see everything go still, turn on Reduce Motion and fully restart the app: `useReducedMotion()` reads the setting once, at launch.

## What the prototype does

1. **Drift.** In Light, the maze's opacity breathes from 0.28 (today's value) down to 0.22 and back, 20 s each way, eased with a sine so there's no visible turnaround. Light only: the dark canvas's treatment is its own decision.
2. **Crossfade on theme switch.** The light and dark canvases (base colour and texture together) are both mounted, and a theme switch fades the dark one in or out over 600 ms instead of swapping them in one frame. The Pick a Card table fades between the light canvas and its mid-tone variant in the same way.
3. **Reduced motion.** With Reduce Motion on, the drift stops at 0.28 and the crossfade is instant, which matches today's static behaviour.

## How it stays cheap

- Everything runs on reanimated shared values: no React state, so neither the drift nor the fade re-renders anything.
- Only a layer's opacity changes. Nothing is re-rasterised: the PNGs are decoded once and composited at a new alpha.
- No new asset. `background-light.png` already bakes the maze at 0.28 over `#efe7f7`, the same colour as the `canvasLight` the screen paints beneath it. Fading the whole image over that colour gives the same result as fading the maze alone: image opacity `m` puts the maze at `0.28 × m`. So the drift runs `m` from 1 to 0.786.
- Cost: both themes' textures stay decoded while the flag is on, about 16 MB each at 2400×1675 RGBA. If the crossfade is kept, the dark layer could mount only while a fade is running.

## Not in the prototype

- **Drift above 0.28.** The ticket's example range, 0.22 to 0.32, goes past what the baked asset holds. Going higher means regenerating a maze-only PNG on a transparent background at a higher `fill-opacity`, using the resvg recipe in [163's proposal](../163-light-mode/proposal.md#wordmark--the-maze-texture), and then animating its opacity over the plain base.
- **Parallax or translating the maze, and animating on card draws or on entering and leaving Play.** These are possible next steps once the drift and the crossfade have been judged on a device.

## Questions for Avi after trying it

- Is the drift noticeable when you look at it directly? It should only register at the edge of attention. Should the period be faster or slower, and the range deeper or shallower?
- Does the crossfade feel right next to the chrome and text, which still change in a single frame? If so, keep it.
