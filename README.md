# Renovate Presets

…

## Usage

### Git upstream tag tracking

Use `gitUpstreamTagsMk.json5` for a versioned tag in a pinned `upstream.mk`.
It updates `UPSTREAM_REF` and the corresponding `UPSTREAM_DIGEST` together,
using Git tags rather than GitHub releases. Patch and minor updates automerge
after the required checks; major updates require Dependency Dashboard approval.

The file must contain a full 40-character commit digest. For branch tracking,
use `gitUpstreamMk.json5` instead. Include **only one** of these upstream presets.

```json5
{
    "extends": [
        "https://git.0xmax42.io/renovate-bot/presets/raw/tag/v0/gitUpstreamTagsMk.json5",
    ],
}
```

### Base Preset

```json5
{
    "$schema": "https://docs.renovatebot.com/renovate-schema.json",
    "extends": [
        "https://git.0xmax42.io/renovate-bot/presets/raw/tag/v0/base.json5",
    ],
}
```

