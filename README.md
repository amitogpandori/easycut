# EasyCut

An easy, InShot-style video editor for Windows, made for vloggers and reel makers.

## Features
- **AI Editor (Windows app, free and offline)**: type what you want — "remove the pauses, add fades, a title and a cinematic look" — and a free AI model running on your own PC through [Ollama](https://ollama.com) edits the timeline for you. EasyCut finds Ollama, starts it, and downloads a model with one click (Qwen 3.5 2B recommended for 4 GB graphics cards; Llama 3.2 3B and Qwen 2.5 3B as options). Every AI change shows a list of what it did and can be undone in one tap. It can split, trim, reorder, shorten to a length, change speed/volume, add transitions, looks, color, filters, motion, text, templates, effects, change the canvas, remove silences, cut at scene changes, adjust music and make a reel
- **Pro editing (Premiere-style)**: keyframes for position, scale, rotation, opacity and volume (with easing); Lumetri-style color grading on the graphics card (exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, vibrance, saturation, fade, sharpen) with 10 looks, auto color, copy/paste grade and your own .cube LUTs; blend modes for overlays; markers (M); In/Out points (I/O, X) with export of just that range; jump between edits (↑/↓); J/K/L playback; slip edit (Alt+drag); mute/hide tracks; snapping on/off; audio level meter; export quality (Standard/High/Max)
- **Smart cuts**: remove silent parts from talking clips automatically, and cut a clip at every scene change
- **Android app** (APK) with a phone layout: preview, timeline with a centred playhead you swipe, bottom toolbar, tools and clip settings slide up as sheets; videos save to Documents/EasyCut with a share sheet (Photos, WhatsApp, Instagram…); back button works
- **InShot-style interface**: start screen, big preview, a bottom toolbar of tools (Media, Reel, Templates, Text, Sticker, GIF, Logo, Music, PIP, Filter, Canvas) plus one-tap clip tools (Split, Speed, Volume, Crop, Transition, Freeze, Rotate, Flip, Copy, Delete)
- **GIFs from the internet** (GIPHY): search GIFs and see-through animated stickers, drop them on your video. Needs a free GIPHY API key (developers.giphy.com → Create an App → API). Your own .gif / animated .webp files work too
- **Logos**: save your logos, make a text logo, add it to the whole video in any corner with size and opacity
- **Stickers**: 200+ emoji in 11 categories (incl. India) plus badge stickers (NEW, WOW!, SALE, LIVE…)
- **Beat effects that follow your song**: EasyCut finds the BPM of the music on the Audio track (beat lines show on it) and 11 beat effects hit on every beat: beat zoom, flash, heartbeat, shake, glitch, RGB, strobe, B&W, colors, blur, confetti
- **60 effects on their own Effects track**, placed anywhere and stretched to any length, with a strength slider: Camera (shake, beat zoom, heartbeat, slow zoom, dolly, swing, spin, zoom blur), Glitch (glitch, RGB split, VHS, pixelate, strobe, static, scanlines), Color (B&W, sepia, invert, rainbow, color pop, duotone, night, golden hour, frozen, dreamy, glow), Light (flash, beat flash, fades, light leak, spotlight, vignette, bokeh), Particles (confetti, snow, rain, sparkles, hearts, emoji rain, bubbles, fireworks, film grain, old film), Frame (cinema bars, mirror, 4 mirrors, 3 copies, tilt-shift, photo frame, glow border)
- **Transitions exactly where you want**: put the playhead anywhere and tap a transition — EasyCut cuts the clip there if needed. Random-on-every-cut too
- **16 transitions**: fade, dissolve, dip to black, zoom in/out, slide, slide up, push, wipe, circle, spin, whip, blur, flash, glitch — with adjustable length
- **Reel Maker** (its own screen): add many clips, drag to reorder, choose the part of each clip to use. **Automatic** mode: pick a song and a style (Beat Drop, Travel Vibes, Cinematic, Glow Up, Day in My Life, Memories, Hype Montage, Desi Wedding, Bhangra Beat, Gym Motivation, Soft Aesthetic, Food Reel). EasyCut finds the song's beat and cuts your clips to it, adding transitions, a look and titles. **Manual** mode: set each clip's length, transition and caption yourself
- Progress percentages for importing, reel making, opening projects and exporting (with time left)
- Fast preview: draws at screen size, exports at full 1080p
- **Combine videos**: join clips one after another, or show them together with layouts (side by side, top/bottom, 3-up, 2×2 grid, 1 big + 2 small, picture-in-picture, reaction circle)
- **43 templates**: intros (vlog, travel, gaming, fitness, birthday, wedding, Diwali, cricket, podcast, Bhangra…), titles, news headline, price tag, lower thirds, social (subscribe, POV, link in bio, poll, part 2), outros. Hindi and Punjabi too
- **My templates & my fonts**: save your own text templates, export/import template packs, add any .ttf/.otf/.woff2 font (see CUSTOMIZING.md)
- **40+ fonts** including Hindi and Punjabi
- **Crop** with presets (Free, Fill canvas, 16:9, 9:16, 1:1, 4:5, 4:3)
- **Fill (no bars)**: every clip fills the canvas with no blurred or colored borders
- **Remove logo / watermark**: Smart fill, Blur or Pixelate
- **Overlays / PiP**: video or photo on top, with green-screen removal, shapes, borders, and a one-click watermark mode
- Split, trim, reorder, duplicate, undo/redo, freeze frame, extract audio
- Speed (0.25x–4x), volume, sound fades, voice effects (Clean voice, Echo, Hall, Radio)
- Motion (zoom in/out, pan), 12 filters, brightness/contrast/saturation, vignette, rotate, mirror
- Text styles, emoji stickers, music with auto-ducking under speech, voiceover recording
- Canvas sizes: 16:9, 9:16, 1:1, 4:5, 4:3
- Save and open projects (.easycut), save any frame as a PNG thumbnail
- Export MP4 at 720p or 1080p, 30 or 60 fps, all on your own PC

## Download
**Android:** on your phone open the latest Release and download `EasyCut-x.y.z.apk`, open it and tap Install (allow installing from your browser/Files the first time). It's signed with the same key every time, so new versions install over the old one.

**Windows:** Go to **Releases** and download `EasyCut-Setup-x.y.z.exe`, then run it.
Windows may show "Windows protected your PC" because the app isn't code-signed yet:
click **More info → Run anyway**.

## Develop
```
npm install
npm start      # run the app
npm test       # automated end-to-end test of the desktop app
npm run dist   # build the Windows installer into dist/
```

GitHub Actions tests the app, builds the installer and publishes it as a Release on every push to `main`.
Bump `version` in package.json for each new release.
