import {Octokit as _Octokit} from "@octokit/core";
import {restEndpointMethods} from "@octokit/plugin-rest-endpoint-methods";
import {paginateGraphQL} from "@octokit/plugin-paginate-graphql";
import {throttling} from "@octokit/plugin-throttling";
import {createSvg} from "./starline-svg.js";
import * as fs from "node:fs";
import * as path from "node:path";
import {
    getLogin,
    getOwnerRepositories,
    getOwnerGists,
    gistExists,
    parseRepository,
} from "./lib/github.js";

const CACHE_FILE = 'starline-cache.json'
const SVG_FILE = 'starline.svg'

const input = {
    resource: process.argv[2],
}

if (!input.resource) {
    console.error('Usage: node create-starline.js <owner|owner/repo|owner/gist-id@gist>')
    process.exit(1)
}

// normalize resource name
const inputResourceParts = input.resource.split('/');
inputResourceParts[0] = await getLogin(inputResourceParts[0]);
input.resource = inputResourceParts.join('/');

const Octokit = _Octokit
    .plugin(throttling)
    .plugin(restEndpointMethods)
    .plugin(paginateGraphQL);

const OctokitThrottle = {
    onRateLimit: (retryAfter, options, octokit, retryCount) => {
        octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`,);
        if (retryCount < 1) {
            octokit.log.info(`Retrying after ${retryAfter} seconds!`);
            return true;
        }
    },
    onSecondaryRateLimit: (retryAfter, options, octokit) => {
        octokit.log.warn(`SecondaryRateLimit detected for request ${options.method} ${options.url}`,);
    },
}

const octokit = new Octokit({auth: process.env.GITHUB_TOKEN, throttle: OctokitThrottle})

// --- main start -------------------------------------------------------------

if (!input.resource.includes('/')) {
    // owner resource: create a starline.svg for each of the owner's
    // repositories/gists, plus an aggregated starline.svg for the owner
    console.log(`Get ${input.resource} owner resources...`)
    const repos = await getOwnerRepositories(input.resource);
    const gists = await getOwnerGists(input.resource);
    const resources = [...repos, ...gists];
    console.log(`  ${repos.length} repositories, ${gists.length} gists`)

    const allDates = []
    for (const resource of resources) {
        const result = await getStargazerDates(resource)
        allDates.push(...result.dates)
        writeSvg(resource, result.dates)
    }

    allDates.sort((a, b) => b - a)
    writeSvg(input.resource, allDates)
} else {
    const result = await getStargazerDates(input.resource)
    writeSvg(input.resource, result.dates)
}

// --- main end ---------------------------------------------------------------

function writeSvg(resource, dates) {
    const svgFile = path.join(resource, SVG_FILE)
    console.log(`Create starline image from ${dates.length} stargazers...`)
    const svg = createSvg(dates)

    console.log(`  Write SVG to ${svgFile}`)
    fs.mkdirSync(path.dirname(svgFile), {recursive: true})
    fs.writeFileSync(svgFile, svg)
}

async function getStargazerDates(resource) {
    console.log(`Get ${resource} stargazers...`)

    const cacheFile = path.join(resource, CACHE_FILE)

    console.log(`  Load stargazers cache...`)
    const stargazerCache = await loadStargazerDates(cacheFile)
    if (stargazerCache.dates.length > 0) {
        console.log(`    ${stargazerCache.dates.length} stargazers (latest: ${stargazerCache.dates[0].toISOString().split('T')[0]})`)
    } else {
        console.log(`    0 stargazers`)
    }

    const fetchedStargazerDates = []

    console.log(`  Fetch stargazers...`)
    for await (const stargazersBatch of await getStargazerIterator(resource)) {
        let stopIterating = false

        const starredAtDates = stargazersBatch.edges.map(({starredAt}) => new Date(starredAt))
        for (const starredAtDate of starredAtDates) {
            if (stargazerCache.dates[0] && starredAtDate <= stargazerCache.dates[0]) {
                stopIterating = true
                break;
            }
            fetchedStargazerDates.push(starredAtDate);
        }

        const fetchedStargazersCount = fetchedStargazerDates.length;
        const stargazersToFetch = stargazersBatch.totalCount - stargazerCache.dates.length;
        const stargazersFetchProgress = stargazersToFetch <= 0 ? 1
            : fetchedStargazersCount / stargazersToFetch;

        console.log(`    ${String(Math.round(stargazersFetchProgress * 100)).padStart(3, ' ')}%  (${String(fetchedStargazersCount).padStart(stargazersToFetch.toString().length, ' ')}/${stargazersToFetch})`)

        if (stopIterating) {
            break;
        }
    }

    const allDates = fetchedStargazerDates.concat(stargazerCache.dates)
    console.log(`    ${allDates.length} stargazers total` +
        (allDates.length > 0 ? ` (latest: ${allDates[0].toISOString().split('T')[0]})` : ''))

    console.log(`  Store stargazers cache to ${cacheFile}`)
    fs.mkdirSync(path.dirname(cacheFile), {recursive: true})
    fs.writeFileSync(cacheFile, JSON.stringify(allDates.map((d) => d.getTime())))

    return {
        cached: stargazerCache.dates.length,
        fetched: fetchedStargazerDates.length,
        dates: allDates,
    }
}

async function getStargazerIterator(repository) {
    // gist
    if (repository.endsWith('@gist')) {
        repository = repository.replace(/@gist$/, '');
        if (!await gistExists(repository)) {
            throw new Error(`Gist ${repository} not found`)
        }
        const repositoryObject = parseRepository(repository);
        return wrapAsyncIteratorWithMapping(octokit.graphql.paginate.iterator(`
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

    // repository
    const repositoryObject = parseRepository(repository);
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
        owner: repositoryObject.owner,
        repo: repositoryObject.repo,
    }), (res) => res.repositoryOwner.repository.stargazers)
}

// --- Cache -------------------------------------------------------------------

async function loadStargazerDates(cacheFile) {
    if (!fs.existsSync(cacheFile)) {
        return {dates: []}
    }

    const content = fs.readFileSync(cacheFile, 'utf-8')
    const dates = JSON.parse(content).map((d) => new Date(d))
    return {dates}
}

// --- Utils -------------------------------------------------------------------

async function* wrapAsyncIteratorWithMapping(asyncIterator, mapFn) {
    for await (const value of asyncIterator) {
        yield await mapFn(value);
    }
}
