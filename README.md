# GitHub Starlines [![starline](https://starlines.qoo.monster/assets/qoomon/starlines)](https://github.com/qoomon/starlines)

Dynamically generated GitHub stargazer history badges. The x-axis of the history is scaled logarithmically.

## Example
[![starline](https://starlines.qoo.monster/assets/gists/5dfcdf8eec66a051ecd85625518cfd13)](https://github.com/qoomon/starline)

## Usage
> [!NOTE]  
> It can take some time until the image is ready, depending on the amount of stargazers to fetch and process.<br>
> If you are eager to watch the image generation workflows progress jump to [workflow runs](https://github.com/qoomon/starline/actions/workflows/create-starline.yaml).

### For GitHub Repositories
```md
[![starline](https://starlines.qoo.monster/assets/OWNER/REPO)](https://github.com/qoomon/starline)
```
### For GitHub Gists
```md
[![starline](https://starlines.qoo.monster/assets/gists/GIST)](https://github.com/qoomon/starline)
```
### For GitHub Users
```md
[![starline](https://starlines.qoo.monster/assets/USER)](https://github.com/qoomon/starline)
```

## Starline Cache
[GitHub Starlines Release](https://github.com/qoomon/starline/releases/tag/starlines)

## Sources
- Heavily inspired by [spark](https://github.com/antonmedv/spark)
  - especially the badge design is a copy of spark
