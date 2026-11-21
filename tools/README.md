# Build tools

These scripts rebuild this pack from the Cobblemon repository. They need Node 22, and Python 3 with Pillow for the icons.

1. `node fetch-assets.js <asset-dir> 151` downloads the Generation 1 models, textures and animations from GitLab one file at a time. GitLab rate-limits it, so it retries slowly. Running it again is safe.
2. `node gen-models.js <asset-dir> <species-dir> <pack-dir>` converts them. `<species-dir>` holds Cobblemon's species JSON files, which give each creature's size.
3. `python make-icons.py <pack-dir>` draws the capture ball, codex and pack icons.
4. `python make-gui.py <pack-dir> <plugin-resources-dir>` draws the menu pictures and the font. It also writes `gui-layout.json` for the plugin and needs the Minecraft 1.21.11 client jar to read letter widths.
5. `python zip-pack.py <pack-dir> <out.zip>` builds the zip and prints its SHA-1.

How the conversion works is described at the top of `gen-models.js`.
