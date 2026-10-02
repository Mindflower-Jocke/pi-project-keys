# pi-project-keys

A [pi](https://pi.dev) extension that uses a different API key per project folder, so you can track
provider costs (e.g. OpenRouter) per project.

## Install

```bash
pi install git:github.com/<you>/pi-project-keys   # or: pi install npm:pi-project-keys
```

## Usage

In a project, run:

| Command | Effect |
|---|---|
| `/projectkey` | Prompt for a key and save it for the current folder |
| `/projectkey <key \| $ENV \| !cmd>` | Save the given value for the current folder |
| `/projectkey show` | Show which folder entry matched and whether the override is active |
| `/projectkey clear` | Remove the key for the current folder |

Keys are stored per provider (of the currently selected model) in `~/.pi/agent/project-keys.json` (mode `600`):

```json
{
  "openrouter": {
    "~/source/project-a": "sk-or-v1-...",
    "~/source": "!security find-generic-password -ws 'openrouter-source'",
    "/work/api": "$OPENROUTER_KEY_API"
  }
}
```

A value is a literal key, an env var (`$NAME` / `${NAME}`), or a `!command` whose output is the key
(run once per pi process). The most specific matching folder wins; entries that fail to resolve are
skipped. With no match, pi's normal credentials are used. The file is re-read on each run.

Prefer `$ENV` or `!command` values so keys are not stored in plaintext.

## How it works

On `session_start` and before each agent run, the extension sets a runtime API key for the current
provider (the same mechanism as `--api-key`, highest credential priority), or removes it when no
folder matches.

## Caveat

It accesses `ctx.modelRegistry.runtime`, which is not part of the documented extension API and may
change in future pi versions. Run `/projectkey show` to diagnose (`runtime=MISSING` means it broke).

## License

MIT
