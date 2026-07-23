import {Octokit as _Octokit} from "@octokit/core";
import {restEndpointMethods} from "@octokit/plugin-rest-endpoint-methods";
import {paginateGraphQL} from "@octokit/plugin-paginate-graphql";
import {throttling} from "@octokit/plugin-throttling";
import {createSvg} from "./starline-svg.js";
import * as fs from "node:fs";
import {
    getLogin,
    gistExists,
    parseRepository,
} from "./lib/github.js";

const CACHE_FILE = 'starline-cache.json'
const SVG_FILE = 'starline.svg'

const input = {
    resource: process.argv[2],
}

if (!input.resource) {
    console.error('Usage: node create-starline.js <owner/repo|owner/gist-id@gist>')
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

const stargazerDates = await getStargazerDates(input.resource)

console.log(`Create starline image from ${stargazerDates.dates.length} stargazers...`)
const svg = createSvg(stargazerDates.dates)

console.log(`  Write SVG to ${SVG_FILE}`)
fs.writeFileSync(SVG_FILE, svg)

// --- main end ---------------------------------------------------------------

async function getStargazerDates(resource) {
    console.log(`Get ${resource} stargazers...`)

    console.log(`  Load stargazers cache...`)
    const stargazerCache = await loadStargazerDates()
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

    console.log(`  Store stargazers cache to ${CACHE_FILE}`)
    fs.writeFileSync(CACHE_FILE, JSON.stringify(allDates.map((d) => d.getTime())))

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

async function loadStargazerDates() {
    if (!fs.existsSync(CACHE_FILE)) {
        return {dates: []}
    }

    const content = fs.readFileSync(CACHE_FILE, 'utf-8')
    const dates = JSON.parse(content).map((d) => new Date(d))
    return {dates}
}

// --- Utils -------------------------------------------------------------------

async function* wrapAsyncIteratorWithMapping(asyncIterator, mapFn) {
    for await (const value of asyncIterator) {
        yield await mapFn(value);
    }
}
