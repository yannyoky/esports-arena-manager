# Claude skills in this repo

Third-party design and game-dev skills, vendored as-is so every cloud session gets them:

| Skill | Source | Commit | License |
|---|---|---|---|
| `impeccable` (+ `.claude/agents/impeccable-*.md`) | [pbakaus/impeccable](https://github.com/pbakaus/impeccable), `plugin/` build, v4.7.1 | `6743a347db6229848348024388033e830ae4af42` | Apache-2.0 (`impeccable/LICENSE`, `impeccable/NOTICE.md`) |
| `review-animations`, `mobile-native`, `break-ui` | [emilkowalski/skills](https://github.com/emilkowalski/skills) | `2d228630ba1446365f614a108cb8252f1feda202` | MIT (`LICENSE` in each folder) |
| `game-feel`, `game-ui-ux`, `game-ai`, `ai-behavior-trees-utility-ai`, `create-game-assets`, `save-systems`, `performance-optimization`, `audio-design`, `camera-systems` | [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills), `skills/disciplines/` (engine-neutral only) | `19d93f97c9c1ea0f8b306e77aa81e0d3e352d3e9` | Apache-2.0 (`_licenses/awesome-gamedev-agent-skills/`) |

Notes:

- Impeccable's automatic hooks (detector on every edit, Stop pass) are NOT enabled. Run checks on demand: `/impeccable audit`, `/impeccable critique`, `/impeccable polish`.
- On first use Impeccable's launcher downloads its engine binary from GitHub releases, verified against `impeccable/scripts/engine-checksums.txt`. Per-developer config and build output are gitignored.
- The only local change: `impeccable-asset-producer.md` uses `${CLAUDE_PROJECT_DIR}/.claude` instead of `${CLAUDE_PLUGIN_ROOT}`.
- `create-game-assets/agents/` (OpenAI config) was dropped; its scripts need Pillow (`pip install -r create-game-assets/scripts/requirements.txt`).
- Engine-specific skills (Godot, Unity, Unreal, Phaser and others) were left out: this game uses its own TypeScript + Canvas engine.
- Design skills were copied from the ayda repo (same versions as listed above).
- To update: copy the same folders from a newer upstream commit and bump the commit in this table.
