# EasyCut

An easy, InShot-style video editor for Windows, made for vloggers.

## Features
- Drag in videos, photos and music; they go straight onto the timeline
- Split, trim, reorder, duplicate, undo/redo
- Speed (0.25x–4x), volume, 12 filters, brightness/contrast/saturation, rotate, mirror
- Transitions: fade, zoom, slide, blur, flash
- Text styles (incl. Hindi & Punjabi), emoji stickers, music, voiceover
- Canvas: 16:9, 9:16 (Reels/Shorts), 1:1, 4:5, 4:3 with blur background
- Export MP4 at 720p or 1080p, all on your own PC

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
Push a tag like `v1.0.1` to publish a new release.
