# EasyCut

An easy, InShot-style video editor for Windows, made for vloggers and reel makers.

## Features
- **Project menu** (📁 Project): New project (Ctrl+N), Open (Ctrl+O), recent projects, Save (Ctrl+S), Save as (Ctrl+Shift+S), Rename, Export (Ctrl+E), Project info, Remove unused media, Optimize heavy videos, Close project (Ctrl+W). Asks to save unsaved changes before closing or starting a new project
- **Reel Maker songs**: add several songs at once; EasyCut counts them, shows the total music time and asks whether to use **all songs one after another** (cuts follow each song's own beat, video matches the songs) or **only one**. Reorder or remove songs. Length option "Match the songs"
- **How long each clip should be**: follow the beat, 1 / 2 / 3 / 5 / 8 s or type any length (kept on the beat when there's a song)
- **Effects amount**: Light (default) / Medium / Strong / None
- Music never jumps back during playback (the song keeps the time)
- **Photo reels (1.14)**: photos work everywhere videos do, alone or mixed with videos. JPG, PNG, WebP and **HEIC (iPhone)** photos open on PC and phone, turned the right way up (EXIF rotation). Very large photos are resized once at high quality so they stay sharp and the preview stays smooth. Photos export at full quality (1080 × 1920 and up). Set one length for every photo in one tap. **12 camera moves** (Ken Burns): zoom in/out, pan in four directions, zoom-and-drift, diagonal and snap zoom, eased so they glide. Reel Maker mixes the moves so no two photos in a row move the same way. It also offers **Smart framing** (tall photos fill the screen, wide ones show whole on a blurred background), **time on screen for each photo** (on the beat, or 1–5 s) and **captions on any photo or clip**
- **Trend styles for Reel Maker**: 📸 Photo Dump (fast beat cuts, flash and swipe, film look, glowing date stamp), 🌀 Velocity Edit (speed ramps on video, snap zooms on photos), 🤍 Minimal Clean, 👾 Glitch Core, 🎞️ Film Roll (film burn and light leak transitions, grain) and 👉 Swipe Carousel
- **Speed ramps (velocity)** on any video clip: Velocity (slow → fast → slow), Fast → slow-mo, and Slow → fast. The clip keeps its length
- **11 new transitions (27 in total)**: Zoom blur, Whip up, Swipe, Light leak, Film burn, RGB split, Shake, Clock wipe, Diamond, Blinds, Doors
- **New effects**: Film burn, Light leak sweep, Light sweep, Date stamp, Motion blur, Chromatic aberration, Teal & orange grade. **New filters**: Teal & Orange, Film, Moody, Y2K, Bleach bypass, Pastel
- **New text animations**: Word by word (caption style), Bounce, Zoom in, Blur in. **8 new templates**: Photo Dump, Year Recap, POV, Wait for the drop, Word-by-word caption, Blur-in title, Lyric line, Swipe for more
- **Smoother editing** (PC and phone): scrubbing, dragging and trimming on the timeline update once per screen frame, the video jumps straight to where you scrub instead of queueing up every frame in between, the playhead glides on the graphics card, zooming with Ctrl+scroll or the slider no longer stutters, only the timeline tracks that changed are redrawn, and on Android taps react instantly and panels slide in
- **Add many songs at once** (Music): EasyCut asks whether they play one after another or all together (layered), and can stop the music with a fade when the video ends
- **Reel Maker 2.0**: shows how much footage you have (e.g. "7:45 of video + 2 photos"), lets you pick 15s / 30s / 1 min / 1:30 / 3 min / all footage or type any length (45, 2:30, 1:05:00). Picks different moments from across every clip, **never uses the same footage twice**, and shuffles them (or keeps them in order). 🎲 New mix makes a fresh version. Effects: the style's own, **shuffled by video type** (Kids, Party, Cinematic, Energetic, Retro, Love, Calm, Travel) or **picked by you**, on some or every cut. 22 styles including new Kids Cartoon, Birthday, Party Night, Retro VHS, Love Story, Nature Calm, Sports Highlights, Festival/Diwali, Gurpurab/Punjabi and Unboxing
- **Smooth playback**: a second player per video so cuts between different parts of the same video are ready in advance; **⚡ Optimize** (Windows) makes edit-friendly copies of heavy phone/4K/HDR videos (1080p, 30 fps, keyframe every ½ s, iPhone HDR to normal colors) — offered on import, in Media (Optimize all), in Reel Maker, and automatically when playback keeps freezing; **Preview quality** Full / Half / Third in Canvas; uses the dedicated NVIDIA/AMD GPU on dual-graphics laptops
- **59 templates** (16 new: kids intro/outro, episode number, birthday, Diwali, Gurpurab, Top 5 countdown, before/after, location tag, quote card, coming up next, giveaway, upload schedule, Hindi/Punjabi like & subscribe, subscribe end screen)
- **AI Upscale (Windows app, free)**: select a video clip → 🔍 AI Upscale → choose 1080p, 2K or 4K and the type of video. *Cartoon / AI video* uses Real-ESRGAN AnimeVideo-v3 (fast, great for animation and AI-generated clips), *Real camera* uses Real-ESRGAN x4plus (stronger, slower), *Quick* uses FFmpeg Lanczos + denoise + sharpening in seconds. Runs on your own graphics card through Vulkan (GTX 1650 and up); the tools (~100 MB) download once on first use. If the card can't run the AI, a standard upscale is used automatically. The sharp copy replaces the clip in your project and is saved in Videos\\EasyCut
- **✨ Enhance** (PC and phone): one tap sharpens a clip and adds clarity and richer color; **export in 720p, 1080p, 2K or 4K**
- **AI Editor (Windows app, free and offline)**: type what you want — "remove the pauses, add fades, a title and a cinematic look" — and a free AI model running on your own PC through [Ollama](https://ollama.com) edits the timeline for you. EasyCut finds Ollama, starts it, and downloads a model with one click (Qwen 3.5 2B recommended for 4 GB graphics cards; Llama 3.2 3B and Qwen 2.5 3B as options). Every AI change shows a list of what it did and can be undone in one tap. It can split, trim, reorder, shorten to a length, change speed/volume, add transitions, looks, color, filters, motion, text, templates, effects, change the canvas, remove silences, cut at scene changes, adjust music and make a reel
- **Pro editing (Premiere-style)**: keyframes for position, scale, rotation, opacity and volume (with easing); Lumetri-style color grading on the graphics card (exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, vibrance, saturation, fade, sharpen) with 10 looks, auto color, copy/paste grade and your own .cube LUTs; blend modes for overlays; markers (M); In/Out points (I/O, X) with export of just that range; jump between edits (↑/↓); J/K/L playback; slip edit (Alt+drag); mute/hide tracks; snapping on/off; audio level meter; export quality (Standard/High/Max)
- **Smart cuts**: remove silent parts from talking clips automatically, and cut a clip at every scene change
- **Android app** (APK) with a phone layout: preview, timeline with a centred playhead you swipe, bottom toolbar, tools and clip settings slide up as sheets; videos save to Documents/EasyCut with a share sheet (Photos, WhatsApp, Instagram…); back button works
- **InShot-style interface**: start screen, big preview, a bottom toolbar of tools (Media, Reel, Templates, Text, Sticker, GIF, Logo, Music, PIP, Filter, Canvas) plus one-tap clip tools (Split, Speed, Volume, Crop, Transition, Freeze, Rotate, Flip, Copy, Delete)
- **GIFs from the internet** (GIPHY): search GIFs and see-through animated stickers, drop them on your video. Needs a free GIPHY API key (developers.giphy.com → Create an App → API). Your own .gif / animated .webp files work too
- **Logos**: save your logos, make a text logo, add it to the whole video in any corner with size and opacity
- **Stickers**: 200+ emoji in 11 categories (incl. India) plus badge stickers (NEW, WOW!, SALE, LIVE…)
- **Beat effects that follow your song**: EasyCut finds the BPM of the music on the Audio track (beat lines show on it) and 11 beat effects hit on every beat: beat zoom, flash, heartbeat, shake, glitch, RGB, strobe, B&W, colors, blur, confetti
- **116 effects on their own Effects track**, placed anywhere and stretched to any length, with a strength slider. New in 1.9: beat spin, beat slide, beat pulse, beat invert, beat mirror, beat grid, beat vignette, beat color flash, handheld, earthquake, Ken Burns, slow pan, bounce, breathing zoom, dutch angle, crash zoom, wavy, slices, glitch blocks, VHS tracking, old TV, vertical RGB, neon, cyberpunk, heat map, Matrix, faded film, pastel, noir, sunset glow, teal & orange, sun rays, lens flare, flicker, iris open/close, eye blink, neon frame, falling petals, autumn leaves, starry night, floating dust, fireflies, balloons, money rain, fog, lightning, sparkle burst, 2 and 9 copies, floating window, film strip, camcorder REC, heart and circle shapes, notebook paper. Earlier: Camera (shake, beat zoom, heartbeat, slow zoom, dolly, swing, spin, zoom blur), Glitch (glitch, RGB split, VHS, pixelate, strobe, static, scanlines), Color (B&W, sepia, invert, rainbow, color pop, duotone, night, golden hour, frozen, dreamy, glow), Light (flash, beat flash, fades, light leak, spotlight, vignette, bokeh), Particles (confetti, snow, rain, sparkles, hearts, emoji rain, bubbles, fireworks, film grain, old film), Frame (cinema bars, mirror, 4 mirrors, 3 copies, tilt-shift, photo frame, glow border)
- **Transitions exactly where you want**: put the playhead anywhere and tap a transition — EasyCut cuts the clip there if needed. Random-on-every-cut too
- **16 transitions**: fade, dissolve, dip to black, zoom in/out, slide, slide up, push, wipe, circle, spin, whip, blur, flash, glitch — with adjustable length
- **Reel Maker** (its own screen): add many clips, drag to reorder, choose the part of each clip to use. **Automatic** mode adds matching effects for each style (e.g. Hype Montage: beat zoom, beat shake, beat glitch; Desi Wedding: sparkles, petals, fireworks; Cinematic: cinema bars, grain, fades) — untick “Add effects” to skip them. Pick a song and a style (Beat Drop, Travel Vibes, Cinematic, Glow Up, Day in My Life, Memories, Hype Montage, Desi Wedding, Bhangra Beat, Gym Motivation, Soft Aesthetic, Food Reel). EasyCut finds the song's beat and cuts your clips to it, adding transitions, a look and titles. **Manual** mode: set each clip's length, transition and caption yourself
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
