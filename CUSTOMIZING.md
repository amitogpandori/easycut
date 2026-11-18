# Adding templates, fonts and features to EasyCut

## Inside the app (no coding)
- **Your own fonts**: Text tab → *Add your own font* (or the **+ Font** button next to the font list). Any `.ttf`, `.otf` or `.woff2` file works. It stays in EasyCut under **My fonts**.
- **Your own templates**: style your text, put the playhead where it shows, then Templates tab → *My templates* → type a name → **Save**. Click it any time to reuse it.
- **Share templates**: *Export pack* saves `EasyCut templates.json`. Send it to another PC and use *Import pack*.

## In the code (built-in for everyone)
Everything lives in `app/index.html`.

### A new text template
Find `TEMPLATES.push(` and add an entry:
```js
{ cat:'Titles', name:'My Title', texts:[
  T('Big text', { font:'Anton', size:120, color:'#ffe600', stroke:true, anim:'pop', y:.45, dur:3 }),
  T('Small text', { size:48, box:true, boxAlpha:.6, anim:'slide', y:.58, start:.3, dur:2.7 }),
] },
```
- `cat`: `Intros` (added at the start), `Titles`, `Social`, `Outros` (added at the end)
- `card:['#hex','#hex'], dur:4` adds a coloured background clip (for intros/outros)
- Text options: `font, size, color, bold, stroke, strokeColor, box, boxColor, boxAlpha, shadow, glow, align, anim ('none'|'fade'|'pop'|'slide'|'type'), x, y (0–1 position), start, dur`

### A new Auto Reel style
Find `REEL_STYLES.push(` and copy one entry. `beats` is how many beats each cut lasts. Optional: `photoMotion:['in','diag','snap']` picks the camera moves for photos (see `KB` / `MOTIONS`), and `ramp:['velocity','hero','rush']` puts speed ramps on video cuts. Add the style's effects in `REEL_FX` (`'effect where strength'`, where is `all`, `start` or `end`).

### A new transition
Add it to `TRANS`, give it an emoji in `TRANS_EMOJI`, and draw it in `renderFrame()` (`case 'mytrans':`). `p` goes from 0 to 1 during the transition, `drawPrev()` draws the clip before and `drawClipAt(c, l, {...})` the new one.

### A new built-in font
1. Add it to the Google Fonts `<link>` at the top of `app/index.html` (e.g. `&family=Lato:wght@400;700`).
2. Add its name to a group in `FONT_GROUPS`.

### Publishing a new version
1. Change `"version"` in `package.json` (e.g. `1.2.0` → `1.3.0`).
2. Push to `main`. GitHub tests the app, builds `EasyCut-Setup-<version>.exe` and publishes it under **Releases**.

## Teaching the AI Editor new tricks
The AI Editor (Windows app) sends the AI a list of the actions it may use, then runs the actions it gets back. To add one:
1. In `app/index.html`, find `function aiSystem()` and add a line describing the new action, e.g. `{"do":"my_action","clip":N,...}`.
2. Find `async function runAction(x)` and add a `case 'my_action':` that changes the project and returns a short message.
3. Optional: add a quick button in `AI_CHIPS` / `AI_CHIP_LABELS`.

To use a different model, download it in Ollama (for example `ollama pull gemma3:4b` in a terminal) — it appears in the AI Editor's model list. Bigger models follow instructions better but need more memory; on a 4 GB graphics card stay at 2–4B models.
