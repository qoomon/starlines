import {Octokit as _Octokit} from "@octokit/core";
import {restEndpointMethods} from "@octokit/plugin-rest-endpoint-methods";
import {paginateGraphQL} from "@octokit/plugin-paginate-graphql";
import {throttling} from "@octokit/plugin-throttling";
import {createSvg} from "./starline-svg.js";
import humanizeDuration from "humanize-duration";
import * as fs from "node:fs";
import * as path from "node:path";
import {downloadGithubReleaseAsset, parseRepository, uploadGithubReleaseAsset} from "./lib/github.js";
import starlineConfig from "./config.js";

const input = {
    repository: process.argv[2]
}

const Octokit = _Octokit
    .plugin(throttling)
    .plugin(restEndpointMethods)
    .plugin(paginateGraphQL);

const OctokitThrottle = {
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
}

const octokit = new Octokit({auth: process.env.GITHUB_TOKEN, throttle: OctokitThrottle})
const octokitGist = new Octokit({auth: process.env.GIST_GITHUB_TOKEN, throttle: OctokitThrottle})

// --- main start -------------------------------------------------------------

const stargazerDates = await getStargazerDates(input.repository)

console.log(`Create starline image...`)
const svg = createSvg(stargazerDates.dates)
const svgFileName = `${input.repository}/${starlineConfig.files.image.name}`

// store image to local file system
const svgFileNameLocal = 'starlines/' + svgFileName
console.log('  Write to ' + svgFileNameLocal)
writeFileSyncRecursive(svgFileNameLocal, svg)

// store image to GitHub release
console.log(`  Upload to GitHub release ${starlineConfig.cache.releaseTag}`)
await uploadGithubReleaseAsset({
    ...starlineConfig.repository,
    releaseTag: starlineConfig.cache.releaseTag,
    fileName: svgFileName,
    label: `Image   ${input.repository}`,
    fileData: svg,
    contentType: starlineConfig.files.image.contentType,
    overwrite: true,
})

// --- main end ---------------------------------------------------------------

async function getStargazerDates(repository) {
    console.log(`Get ${repository} stargazers...`)

    if (repository.startsWith('users/')) {
        let user = parseRepository(repository).repo
        let cached = 0
        let fetched = 0
        let dates = []

        const repositories = await getUserRepositories(user)
        for (const repository of repositories) {
            console.log(repository + '...')
            const stargazerDates = await getStargazerDates(repository)
            cached += stargazerDates.cached
            fetched += stargazerDates.fetched
            dates = dates.concat(stargazerDates.dates)
        }
        return {
            cached,
            fetched,
            dates,
        }
    }

    console.log(`  Load stargazers cache...`)
    const stargazerCache = await loadStargazerDates(repository)
    if (stargazerCache.dates.length > 0) {
        console.log(`    ${stargazerCache.dates.length} stargazers (latest: ${stargazerCache.dates[0].toISOString().split('T')[0]}`)
    } else {
        console.log(`    0 stargazers`)
    }

    const repositoryObject = parseRepository(repository)
    const fetchedStargazerDates = []

    console.log(`  Fetch stargazers...`)
    const stargazersIterator = getStargazerIterator(repositoryObject)
    for await (const stargazersBatch of stargazersIterator) {
        let stopIterating = false

        const starredAtDates = stargazersBatch.edges.map(({starredAt}) => new Date(starredAt))
        for (const starredAtDate of starredAtDates) {
            if (starredAtDate <= stargazerCache.dates[0]) {
                stopIterating = true
                break;
            }
            fetchedStargazerDates.push(starredAtDate);
        }

        const fetchedStargazersCount = fetchedStargazerDates.length;
        const stargazersToFetch = stargazersBatch.totalCount - (stargazerCache.dates?.length);
        const stargazersFetchProgress = stargazersToFetch <= 0 ? 1
            : fetchedStargazersCount / stargazersToFetch;

        console.log(`    ${String(Math.round(stargazersFetchProgress * 100)).padStart(3, ' ')}%  (${String(fetchedStargazersCount).padStart(stargazersToFetch.toString().length, ' ')}/${stargazersToFetch})`)

        if (stopIterating) {
            break;
        }
    }

    const stargazerDates = fetchedStargazerDates.concat(stargazerCache.dates)
    if (fetchedStargazerDates.length > 0) {
        console.log(`  Store stargazers cache...`)
        await storeStargazerDates(repository, stargazerDates)
        console.log(`    ${stargazerDates.length} stargazers (latest: ${stargazerDates[0].toISOString().split('T')[0]})`)
    }

    return {
        cached: stargazerCache.dates.length,
        fetched: fetchedStargazerDates.length,
        dates: stargazerDates,
    }
}

function getStargazerIterator(repositoryObject) {
    if (repositoryObject.owner === 'gists') {
        return wrapAsyncIteratorWithMapping(octokitGist.graphql.paginate.iterator(`
                query paginate ($gist: String!, $cursor: String) {
                  viewer {
                    gist(name: $gist) {
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
            gist: repositoryObject.repo,
        }), (res) => res.viewer.gist.stargazers)
    }

    return wrapAsyncIteratorWithMapping(octokit.graphql.paginate.iterator(`
                query paginate ($owner: String!, $repo: String!, $cursor: String) {
                  repositoryOwner(login: $owner) {
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
    }), (res) => res.repositoryOwner.repository.stargazers)
}

async function getUserRepositories(user) {
    let result = []

    const repositories = await octokit.graphql.paginate(`
        query paginate ($owner: String!, $cursor: String) {
          repositoryOwner(login: $owner) {
            repositories(first: 100, after: $cursor) {
              nodes {
                name
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            } 
          }
        }`, {
        owner: user,
    }).then((data) => data.repositoryOwner.repositories.nodes.map(({name}) => `${owner}/${name}`))

    result = result.concat(repositories)

    const gists = await octokitGist.graphql.paginate(`
        query paginate ($user: String!, $cursor: String) {
          user(login: $user) {
            gists(first: 100, after: $cursor) {
              nodes {
                name
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }`, {
        user,
    }).then((data) => data.user.gists.nodes.map(({name}) => `gists/${name}`))

    result = result.concat(gists)

    return result
}

// --- Stargazer Store ---------------------------------------------------

async function storeStargazerDates(repository, dates) {
    const fileName = `${repository}/${starlineConfig.files.dates.name}`
    let fileData = dates.map((date) => date.getTime())
    fileData = JSON.stringify(fileData)

    // local file store
    writeFileSyncRecursive('starlines/' + fileName, fileData)

    // github release store
    await uploadGithubReleaseAsset({
        ...starlineConfig.repository,
        releaseTag: starlineConfig.cache.releaseTag,
        fileName,
        label: `Cache   ${repository}`,
        fileData,
        contentType: starlineConfig.files.dates.contentType,
        overwrite: true,
    })
}

/**
 * Load dates
 * @param repository
 * @returns {Promise<{dates: Date[], age: number}>}
 */
async function loadStargazerDates(repository) {
    const asset = await downloadGithubReleaseAsset({
        ...starlineConfig.repository,
        releaseTag: starlineConfig.cache.releaseTag,
        fileName: `${repository}/${starlineConfig.files.dates.name}`,
    })
    if (!asset) {
        return {
            dates: [],
            age: Infinity,
        }
    }

    return {
        dates: JSON.parse(asset.data).map((date) => new Date(date)),
        age: parseInt(asset.age),
    }
}

// --- Utils -------------------------------------------------------------------

function writeFileSyncRecursive(filename, content = '') {
    fs.mkdirSync(path.dirname(filename), {recursive: true})
    fs.writeFileSync(filename, content)
}

async function* wrapAsyncIteratorWithMapping(asyncIterator, mapFn) {
    for await (const value of asyncIterator) {
        yield await mapFn(value);
    }
}


