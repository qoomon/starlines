import {Octokit as _Octokit} from "@octokit/core";
import {restEndpointMethods} from "@octokit/plugin-rest-endpoint-methods";
import {paginateGraphQL} from "@octokit/plugin-paginate-graphql";
import {throttling} from "@octokit/plugin-throttling";
import {createSvg} from "./starline-svg.js";
import * as fs from "node:fs";
import * as path from "node:path";

const config = {
    cache: 'github', // or 'github' or 'local'
    starlineStoreRelease: {
        ...parseRepository(process.env.GITHUB_REPOSITORY),
        tag: 'starlines',
    }
}

const input = {
    repository: process.argv[2]
}

const Octokit = _Octokit
    .plugin(throttling)
    .plugin(restEndpointMethods)
    .plugin(paginateGraphQL);

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
    throttle: {
        onRateLimit: (retryAfter, options, octokit, retryCount) => {
            octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`,);

            if (retryCount < 1) {
                // only retries once
                octokit.log.info(`Retrying after ${retryAfter} seconds!`);
                return true;
            }
        }, onSecondaryRateLimit: (retryAfter, options, octokit) => {
            // does not retry, only logs a warning
            octokit.log.warn(`SecondaryRateLimit detected for request ${options.method} ${options.url}`,);
        },
    },
})

const stargazerDates = await getStargazerDates(input.repository)

if (stargazerDates.newCount > 0) {
    const svg = createSvg(stargazerDates.dates)
    const svgFileName = `${input.repository}/starline.svg`

    // local store
    writeFileSyncRecursive(svgFileName, svg)
    console.log('Saved: ' + svgFileName)

    // github release store
    const svgAsset = await uploadGithubReleaseAsset({
        ...config.starlineStoreRelease,
        releaseTag: config.starlineStoreRelease.tag,
        fileName: svgFileName, fileData: svg,
    })
    console.log('Uploaded: ' + svgAsset.browser_download_url)
} else {
    console.log('No new stargazers found. Nothing to do.')
}

// --- Fetch Stargazer Dates --------------------------------------------------

async function getStargazerDates(repository) {
    console.log('Load stargazer cache...' )
    const repositoryObject = parseRepository(input.repository)
    const cachedStargazerDates = await loadStargazerDates(repository)
    const cachedStargazerUntilDate = cachedStargazerDates[0] || new Date(0)
    console.log('Stargazer cache loaded.\n  ' + cachedStargazerDates.length + ' stargazers until ' + cachedStargazerUntilDate)

    const newStargazerDates = []
    let stargazersIterator
    if (repositoryObject.type === 'gist') {  // gist stargazers
        stargazersIterator = octokit.graphql.paginate.iterator(`
            query paginate ($owner: String!, $gist: String!, $cursor: String) {
              owner: user(login: $owner) {
                repository: gist(name: $gist) {
                  stargazers(first: 100, orderBy: {field:STARRED_AT, direction: DESC}, after: $cursor) {
                    totalCount
                    edges {
                      starredAt
                    }
                    pageInfo {
                      hasNextPage
                      endCursor
                    }
                  }
                }
              }
            }`, {
            owner: repositoryObject.owner, gist: repositoryObject.repo,
        })
    } else { // repo stargazers
        stargazersIterator = octokit.graphql.paginate.iterator(`
            query paginate ($owner: String!, $repo: String!, $cursor: String) {
              owner: repositoryOwner(login: $owner) {
                repository(name: $repo) {
                  stargazers(first: 100, orderBy: {field:STARRED_AT, direction: DESC}, after: $cursor) {
                    totalCount
                    edges {
                      starredAt
                    }
                    pageInfo {
                      hasNextPage
                      endCursor
                    }
                  }
                }   
              }
            }`, {
            owner: repositoryObject.owner, repo: repositoryObject.repo,
        })
    }

    for await (const response of stargazersIterator) {
        const stargazersBatch = response.owner.repository.stargazers;
        const starredAtDates = stargazersBatch.edges.map(({starredAt}) => new Date(starredAt))

        let doneFetching = false
        for (const starredAtDate of starredAtDates) {
            if (starredAtDate <= cachedStargazerUntilDate) {
                doneFetching = true
                break;
            }
            newStargazerDates.push(starredAtDate);
        }

        const fetchedStargazers = newStargazerDates.length;
        const stargazersToFetch = stargazersBatch.totalCount - cachedStargazerDates.length;
        const stargazersFetchProgress = stargazersToFetch > 0
            ? fetchedStargazers / stargazersToFetch
            : 1;

        console.log('Progress: ' + (Math.round(stargazersFetchProgress * 100)) + '%' + ' (' + fetchedStargazers + '/' + stargazersToFetch + ')')

        if (doneFetching) {
            break;
        }
    }

    const stargazerDates = [...newStargazerDates, ...cachedStargazerDates]
    const stargazerUntilDate = cachedStargazerDates[0] || new Date(0)
    if(newStargazerDates.length > 0) {
        console.log('Store stargazer cache...')
        await storeStargazerDates(repository, stargazerDates)
        console.log('Stargazer cache stored.\n  ' + stargazerDates.length + 'stargazers until ' + stargazerUntilDate)
    }

    return {
        dates: stargazerDates,
        newCount: newStargazerDates.length,
    }
}

// --- Stargazer Dates Store ---------------------------------------------------

async function storeStargazerDates(repository, dates) {
    const fileName = `${repository}/stargazer-dates.json`

    // local file store
    let fileData = dates.map((date) => date.getTime())
    fileData = JSON.stringify(fileData)
    writeFileSyncRecursive(fileName, fileData)

    // github release store
    await uploadGithubReleaseAsset({
        ...config.starlineStoreRelease,
        releaseTag: config.starlineStoreRelease.tag,
        fileName, fileData,
    })
}

/**
 * Load dates
 * @param repository
 * @returns {Promise<Date[]>}
 */
async function loadStargazerDates(repository) {
    const fileName = `${repository}/stargazer-dates.json`

    let fileBuffer

    if (config.cache === 'github') {
        // github release store
        fileBuffer = await downloadGithubReleaseAsset({
            ...config.starlineStoreRelease,
            releaseTag: config.starlineStoreRelease.tag,
            fileName,
        })
    } else {
        // local file store
        if (!fs.existsSync(fileName)) {
            return []
        }
        fileBuffer = fs.readFileSync(fileName)
    }

    return fileBuffer
        ? JSON.parse(fileBuffer)
            .map((date) => new Date(date))
        : []
}

async function uploadGithubReleaseAsset({owner, repo, releaseTag, fileName, fileData}) {
    const release = await octokit.rest.repos.getReleaseByTag({
        owner, repo, tag: releaseTag,
    }).then(({data}) => data)

    const releaseAssetName = fileName.replaceAll('/', '.')

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

    // upload
    return await octokit.rest.repos.uploadReleaseAsset({
        owner, repo, release_id: release.id,
        name: releaseAssetName, data: fileData,
        headers: {
            'content-type': 'image/svg+xml',
            'content-length': fileData.length,
        },
        mediaType: {
            format: 'raw',
            previews: [],
        }
    })
}

async function downloadGithubReleaseAsset({owner, repo, releaseTag, fileName}) {
    const release = await octokit.rest.repos.getReleaseByTag({
        owner, repo, tag: releaseTag,
    }).then(({data}) => data)

    const releaseAssetName = fileName.replaceAll('/', '.')

    const assetId = await getGithubReleaseAssetId({
        owner, repo, releaseTag,
        assetName: releaseAssetName,
    })
    if (!assetId) {
        return
    }

    // download
    return await octokit.rest.repos.getReleaseAsset({
        owner, repo, release_id: release.id,
        asset_id: assetId,
    }).then(({data}) => fetch(data.browser_download_url))
        .then(res => res.arrayBuffer())
        .then(arrayBuffer => Buffer.from(arrayBuffer))
}

async function getGithubReleaseAssetId({owner, repo, releaseTag, assetName}) {
    const release = await octokit.rest.repos.getReleaseByTag({
        owner, repo, tag: releaseTag,
    }).then(({data}) => data)

    // TODO improve
    return await octokit.rest.repos.listReleaseAssets({
        owner, repo, release_id: release.id,
    }).then(({data}) => data.find(({name}) => name === assetName)?.id)

    return await octokit.graphql(`
        query ($owner: String!, $repo: String!, $releaseTag: String!, $assetName: String!) {
            owner: repositoryOwner(login: $owner) {
                repository(name: $repo) {
                    release(tagName: $releaseTag) {
                        assets: releaseAssets(first: 1, name: $assetName) {
                            nodes {
                                id
                                name
                            }
                        }
                    }
                }
            }
        }`, {
        owner, repo, releaseTag, assetName
    }).then(({data}) => data.owner.repository.release.assets.nodes[0]?.id)
}

// --- Utils -------------------------------------------------------------------

function lastElement(array) {
    return array[array.length - 1]
}

function writeFileSyncRecursive(filename, content = '') {
    fs.mkdirSync(path.dirname(filename), {recursive: true})
    fs.writeFileSync(filename, content)
}

function parseRepository(input) {
    let type = 'repository'
    if (input.endsWith('@gist')) {
        type = 'gist'
        input = input.replace(/@gist$/, '')
    }

    const [owner, repo] = input.split('/')
    return {owner, repo, type}
}

