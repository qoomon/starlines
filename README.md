# GitHub Starlines

> [!CAUTION]
> Unfortunately [GitHub restricted access to stargazers](https://github.blog/changelog/2026-06-30-upcoming-access-restrictions-to-public-api-endpoints-and-ui-views/). The public endpoint is no longer available. Use the GitHub Action below to generate starlines for your own repositories.

Generates stargazer history badges (SVGs) for GitHub repositories and gists.

> [!Note]
> The starline x-axis is scaled logarithmically and the y-axis is scaled by square root.

## Example
![starline](api/assets/animated-demo.svg)

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
      - uses: actions/checkout@v4

      - name: Generate starline
        id: starline
        uses: qoomon/starlines@main
        with:
          resource: owner/repo           # or owner/gist-id@gist for gists
          github-token: ${{ secrets.GITHUB_TOKEN }}
          cache-file: stargazer-dates.json  # optional: resume from existing cache

      - name: Commit outputs
        run: |
          cp "${{ steps.starline.outputs.svg-file }}" starline.svg
          cp "${{ steps.starline.outputs.cache-file }}" stargazer-dates.json
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add starline.svg stargazer-dates.json
          git commit -m "update starline" && git push || true
```

### Inputs

| Input | Required | Description |
|---|---|---|
| `resource` | ✅ | Repository (`owner/repo`) or gist (`owner/gist-id@gist`) |
| `github-token` | ✅ | GitHub token with read access to the target repository/gist stargazers |
| `gist-github-token` | ❌ | GitHub token with gist read access (falls back to `github-token`) |
| `cache-file` | ❌ | Path to an existing cache JSON file to resume from |

### Outputs

| Output | Description |
|---|---|
| `svg-file` | Absolute path to the generated starline SVG |
| `cache-file` | Absolute path to the updated stargazer dates cache JSON |

## Sources
- Heavily inspired by [spark](https://github.com/antonmedv/spark)
  - especially the badge design is a copy of spark
