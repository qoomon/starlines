import {Octokit as _Octokit} from "@octokit/core";
import {restEndpointMethods} from "@octokit/plugin-rest-endpoint-methods";
import {paginateRest} from "@octokit/plugin-paginate-rest";

const Octokit = _Octokit
    .plugin(restEndpointMethods)
    .plugin(paginateRest);

const octokit = new Octokit({auth: process.env.GITHUB_TOKEN});

export function parseRepository(input) {
    if (input.split('/').length !== 2) {
        throw new Error('Invalid repository')
    }

    const [owner, repo] = input.split('/')
    return {owner, repo}
}

export async function userExists(user) {
    const userResponse = await fetch(`https://api.github.com/users/${user}`, {
        method: 'HEAD'
    })
    return userResponse.status === 200 || userResponse.status === 304;
}

export async function repositoryExists(repository) {
    const {owner, repo} = parseRepository(repository)
    const repositoryResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        method: 'HEAD'
    })
    return repositoryResponse.status === 200 || repositoryResponse.status === 304;
}

export async function gistExists(repository) {
    const {owner, repo} = parseRepository(repository);
    // const gistResponse = await fetch(`https://api.github.com/gists/${repo}`, {
    //     method: 'HEAD'
    // })
    // return gistResponse.status === 200 || gistResponse.status === 304;

    const gistOwner = await getGistOwner(repo);
    return gistOwner !== owner;
}

export async function getGistOwner(gist) {

    return fetch(`https://gist.github.com/${gist}`, {redirect: 'manual'})
        .then((res) => {
            if (res.status === 301) {
                return res.headers.get('location')
                        .match(/https:\/\/github.com\/(?<owner>[^/]+)/)
                        ?.groups?.owner
                    ?? null;
            }
            return null;
        });
}

export async function githubReleaseAssetExists({owner, repo, releaseTag, fileName}) {
    const releaseAssetName = normalizeAssetFilename(fileName)
    const assetUrl = `https://github.com/${owner}/${repo}/releases/download/${releaseTag}/${releaseAssetName}`

    const assetResponse = await fetch(assetUrl, {
        method: 'HEAD'
    })
    return assetResponse.status === 200 || assetResponse.status === 304
}

export async function uploadGithubReleaseAsset({
                                                   owner,
                                                   repo,
                                                   releaseTag,
                                                   fileName,
                                                   label,
                                                   fileData,
                                                   contentType,
                                                   overwrite = false
                                               }) {
    const releaseAssetName = normalizeAssetFilename(fileName)

    if (overwrite) {
        const assetId = await getGithubReleaseAssetId({
            owner, repo, releaseTag,
            assetName: releaseAssetName,
        })
        if (assetId) {
            // delete asset
            await octokit.rest.repos.deleteReleaseAsset({
                owner, repo, asset_id: assetId,
            })
        }
    }

    // upload
    const release = await octokit.rest.repos.getReleaseByTag({
        owner, repo, tag: releaseTag,
    }).then(({data}) => data)
    return await octokit.rest.repos.uploadReleaseAsset({
        owner, repo, release_id: release.id,
        name: releaseAssetName,
        label,
        data: fileData,
        headers: {
            'content-type': contentType,
            'content-length': fileData.length,
        },
    })
}

export async function deleteGithubReleaseAsset({owner, repo, releaseTag, fileName}) {
    const releaseAssetName = normalizeAssetFilename(fileName)

    const assetId = await getGithubReleaseAssetId({
        owner, repo, releaseTag,
        assetName: releaseAssetName,
    })
    if (assetId) {
        // delete asset
        await octokit.rest.repos.deleteReleaseAsset({
            owner, repo, asset_id: assetId,
        })
    }
}

export async function downloadGithubReleaseAsset({owner, repo, releaseTag, fileName}) {
    const releaseAssetName = normalizeAssetFilename(fileName)
    const assetUrl = `https://github.com/${owner}/${repo}/releases/download/${releaseTag}/${releaseAssetName}`

    const assetResponse = await fetch(assetUrl)
    if (assetResponse.status === 200 || assetResponse.status === 304) {
        const lastModified = new Date(assetResponse.headers.get('last-modified'))
        const age = Math.floor((new Date() - lastModified) / 1000)
        const data = await assetResponse.arrayBuffer()
            .then(arrayBuffer => Buffer.from(arrayBuffer))
        return {data, lastModified, age}
    }
    return null

}

async function getGithubReleaseAssetId({owner, repo, releaseTag, assetName}) {
    const release = await octokit.rest.repos.getReleaseByTag({
        owner, repo,
        tag: releaseTag,
    }).then(({data}) => data)

    return await octokit.paginate(octokit.rest.repos.listReleaseAssets, {
        owner, repo,
        release_id: release.id,
        per_page: 100,
    }).then((data) => data.find(({name}) => name === assetName)?.id)

    // --- Following query does not work, because asset id cannot be used to delete asset via rest api
    // return await octokit.graphql(`
    //     query ($owner: String!, $repo: String!, $releaseTag: String!, $assetName: String!) {
    //         owner: repositoryOwner(login: $owner) {
    //             repository(name: $repo) {
    //                 release(tagName: $releaseTag) {
    //                     assets: releaseAssets(first: 1, name: $assetName) {
    //                         nodes {
    //                             id
    //                             name
    //                         }
    //                     }
    //                 }
    //             }
    //         }
    //     }`, {
    //     owner, repo, releaseTag, assetName
    // }).then(({data}) => data.owner.repository.release.assets.nodes[0]?.id)
}

function normalizeAssetFilename(filename) {
    // TODO: replace all invalid characters
    return filename
        .replaceAll('/', '--')
        .replaceAll('@', '--')
}
