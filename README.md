# Romeid flowchart skill

Teach your AI coding agent to write readable Mermaid flowcharts and share them as [Romeid](https://romeid.mnbdev.space/) links.

## Install

Run this in the project where you use your agent:

```bash
npx skills add mglnb/romeid-flowchart
```

The installer supports Claude Code, Codex, Cursor, Gemini CLI, Copilot, OpenCode and other compatible agents. Select the agent and installation scope when prompted. Restart the agent, then ask for a flowchart in your language.

The skill uses the Romeid MCP tool when available, then the [`@mglnb/romeid` CLI](https://www.npmjs.com/package/@mglnb/romeid), and finally its bundled offline sharing script. The diagram is encoded in the URL fragment; it is not uploaded to Romeid.

## Contents

- [`skills/romeid-flowchart/SKILL.md`](skills/romeid-flowchart/SKILL.md): workflow and writing guidance
- [`skills/romeid-flowchart/references/flowchart-syntax.md`](skills/romeid-flowchart/references/flowchart-syntax.md): supported Mermaid syntax
- [`skills/romeid-flowchart/scripts/share.mjs`](skills/romeid-flowchart/scripts/share.mjs): offline link generation

The source is maintained in [Romeid's project repository](https://github.com/mglnb/romeid) under `skills/romeid-flowchart/`.

MIT © 2026 mglnb
