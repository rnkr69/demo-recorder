# Fuentes empacadas

Tipografías incluidas en el motor para que la generación de vídeo sea **determinista y
cross-platform**: el render de subtítulos, intro y contact-sheet usa estos ficheros en lugar de
fuentes instaladas en el sistema operativo (que difieren entre Windows/macOS/Linux).

Resueltas por `src/fonts.js` (mismo patrón que la música de `audio/bg/` en `src/tracks.js`).

| Fichero             | Familia | Peso    |
|---------------------|---------|---------|
| `Inter-Regular.ttf` | Inter   | Regular |
| `Inter-Bold.ttf`    | Inter   | Bold    |

- **Origen:** [Inter](https://github.com/rsms/inter) v4.1 — `extras/ttf/` (instancias estáticas).
- **Licencia:** SIL Open Font License 1.1 — ver `OFL.txt`.
