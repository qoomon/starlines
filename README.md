# GitHub Starlines

> [!CAUTION]
> Unfortunately [GitHub restricted access to stargazers](https://github.blog/changelog/2026-06-30-upcoming-access-restrictions-to-public-api-endpoints-and-ui-views/). The public endpoint is no longer available. Use the GitHub Action below to generate starlines for your own repositories.

Generates stargazer history badges (SVGs) for GitHub repositories and gists.

> [!Note]
> The starline x-axis is scaled logarithmically and the y-axis is scaled by square root.

## Example
![starline](https://raw.githubusercontent.com/qoomon/starlines/assets/qoomon/starlines/starline.svg)

## Usage

Add a workflow to your repository that runs the action and commits the outputs:

```yaml
name: Update Starline

on:
  schedule:
    - cron: '0 0 * * 0'  # weekly
  workflow_dispatch:

jobs:
  starline:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v7
        with:
           ref: starlines

      - uses: qoomon/starlines@main

      - uses: qoomon/actions--setup-git@v1
      - run: |
          git add starlines
          git commit -m "chore: update starline" || true
          git push 
```

The action writes `starline.svg` and `starline-cache.json` directly to the workspace root. If `starline-cache.json` already exists (e.g. committed from a previous run), it is used to resume incremental fetching.

### Inputs

| Input | Required | Description |
|---|---|---|
| `resource` | ✅ | Owner (`owner`), repository (`owner/repo`), or gist (`owner/gist-id@gist`). When only an owner is specified, stars from all their repositories and gists are combined. |
| `github-token` | ✅ | GitHub token with read access to the target repository or gist stargazers |

## Sources
- Heavily inspired by [spark](https://github.com/antonmedv/spark)
  - especially the badge design is a copy of spark
