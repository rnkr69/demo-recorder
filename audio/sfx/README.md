# audio/sfx/ — efectos de sonido para `encode.sfx`

Suelta aquí ficheros de audio cortos (`.wav`/`.mp3`/`.m4a`/…) y el motor los sincroniza con los
**beats** de la grabación (clicks, zooms, teclas) usando el sidecar `<video>.events.json`.

La resolución funciona igual que la música (`audio/bg/`): por nombre exacto, por alias/slug o por
ruta. Los SFX son **opcionales** — si un nombre no se resuelve, ese efecto simplemente se omite
(no rompe el render).

## Nombres por defecto (mapa kind → SFX)

| evento (`kind`) | SFX por defecto |
|---|---|
| `click`, `nav`   | `click` |
| `zoom`, `zoomOut`, `spotlight` | `whoosh` |
| `keycap`         | `key` |
| `success`        | `chime` |
| `type`, `move`, `scroll` | (silenciados) |

Así que basta con dejar aquí `click.wav`, `whoosh.wav`, `key.wav`, `chime.wav` (o alias que
contengan esas palabras) para tener SFX. Sobrescribe el mapa desde el `.yml`:

```yaml
encode:
  sfx:
    gain: 0.8                 # ganancia global (0..1+)
    map:
      click: pop              # usa audio/sfx/pop.wav para los clicks
      zoom: { name: swoosh, gain: 0.5 }
      nav: null               # silencia un kind
    # dir: assets/my-sfx      # opcional: carpeta propia en tu proyecto
```

No se incluyen binarios de audio en el repo: trae los tuyos (libres de derechos) o apunta `dir` a
tu propia carpeta.
