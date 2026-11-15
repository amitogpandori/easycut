# EasyCut

An easy, InShot-style video editor for Windows, made for vloggers and reel makers.

## Features
- **Auto Reel**: pick clips, a song and a style (Beat Drop, Travel Vibes, Cinematic, Glow Up, Day in My Life, Memories, Hype Montage, Desi Wedding). EasyCut finds the song's beat and cuts your clips to it, adding transitions, a look and titles.
- **Combine videos**: join clips one after another, or show them together with layouts (side by side, top/bottom, 3-up, 2×2 grid, 1 big + 2 small, picture-in-picture, reaction circle)
- **Templates**: intros, titles, lower thirds, location tags, subscribe/follow buttons, 3-2-1 countdown, before/after, outros (Hindi and Punjabi too)
- **Crop** with presets (Free, Fill canvas, 16:9, 9:16, 1:1, 4:5, 4:3)
- **Fill (no bars)**: every clip fills the canvas with no blurred or colored borders
- **Remove logo / watermark**: Smart fill, Blur or Pixelate
- **Overlays / PiP**: video or photo on top, with green-screen removal, shapes, borders, and a one-click watermark mode
- Split, trim, reorder, duplicate, undo/redo, freeze frame, extract audio
- Speed (0.25x–4x), volume, sound fades, voice effects (Clean voice, Echo, Hall, Radio)
- Motion (zoom in/out, pan), 12 filters, brightness/contrast/saturation, vignette, rotate, mirror
- Transitions: fade, zoom, slide, blur, flash
- Text styles, emoji stickers, music with auto-ducking under speech, voiceover recording
- Canvas sizes: 16:9, 9:16, 1:1, 4:5, 4:3
- Save and open projects (.easycut), save any frame as a PNG thumbnail
- Export MP4 at 720p or 1080p, 30 or 60 fps, all on your own PC

## Download
Go to **Releases** and download `EasyCut-Setup-x.y.z.exe`, then run it.
Windows may show "Windows protected your PC" because the app isn't code-signed yet:
click **More info → Run anyway**.

## Develop
```
npm install
npm start      # run the app
npm test       # automated end-to-end test of the desktop app
npm run dist   # build the Windows installer into dist/
```

GitHub Actions builds and tests the installer on every push to `main`.
Push a tag like `v1.1.0` to publish a new release.
