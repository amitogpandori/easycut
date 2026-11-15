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
Find `REEL_STYLES.push(` and copy one entry. `beats` is how many beats each cut lasts.

### A new built-in font
1. Add it to the Google Fonts `<link>` at the top of `app/index.html` (e.g. `&family=Lato:wght@400;700`).
2. Add its name to a group in `FONT_GROUPS`.

### Publishing a new version
1. Change `"version"` in `package.json` (e.g. `1.2.0` → `1.3.0`).
2. Push to `main`. GitHub tests the app, builds `EasyCut-Setup-<version>.exe` and publishes it under **Releases**.
