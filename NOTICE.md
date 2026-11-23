# Notice

## Cobblemon assets

The creature models, textures and idle poses in this pack come from Cobblemon, an open-source Pokemon mod for Minecraft: https://gitlab.com/cable-mc/cobblemon. The authors are the Cobblemon team and its contributors.

- Every model folder in the Cobblemon repository carries a licence file with the Creative Commons Attribution-NonCommercial 3.0 legal code. That text is in LICENSES/CC-BY-NC-3.0.txt. The models here are adaptations of those models, and this pack is shared under the same terms: attribution, no commercial use.
- The rest of the Cobblemon repository is under the Mozilla Public License 2.0, in LICENSES/MPL-2.0.txt. The creature textures have no separate licence file in the repository and are treated the same way.

Changes made to the originals:

- The Bedrock geometry files were converted to Java item models with a script (tools/gen-models.js in this repository). Bone transforms were combined into a rotation for each cube.
- The pose shown is the species' ground idle animation at time zero. Nothing is animated.
- A model that did not fit the model size limit was scaled down, and the plugin scales it back up when it shows it.
- Textures were copied without changes.
- For animated creatures (`assets/captura/models/rig` and `items/rig`), each model is also split into up to 12 parts by `tools/gen-rigs.js` in the Captura repository. The plugin plays Cobblemon's idle, walk, battle, attack, cry and faint animations on those parts; the animations are sampled from Cobblemon's animation files and are used under the same non-commercial terms as the models.

## Trademarks

Pokemon and the names of the creatures are trademarks of Nintendo, Creatures Inc. and Game Freak. This pack has no connection with them. It is made for a small private community server and is not for sale.

## Original work

The capture ball icon, the codex icon and the pack icon were drawn for Captura and are released under the same non-commercial terms as the rest of the pack.

The battle hotbar icons (`textures/item/gui`) and the thin slot hover outline that replaces the grey hover square in every inventory were drawn for Captura by `tools/make-gui.py`.

The menu art (backgrounds, buttons, HP bar) and the font definition `assets/captura/font/gui.json` were also drawn for Captura by `tools/make-gui.py`. They are not based on Cobblemon's interface art. The font points at Minecraft's own `font/ascii.png` for its letters, so no Mojang file is copied into the pack.
