import { waitUntil } from "@vercel/functions";
import {Octokit as _Octokit} from "@octokit/core";
import {restEndpointMethods} from "@octokit/plugin-rest-endpoint-methods";
import {createLoadingSvg} from "../starline-svg.js";
import {downloadGithubReleaseAsset, parseRepository, repositoryExists} from "../lib/github.js";
import starlineConfig from "../config.js";

const Octokit = _Octokit.plugin(restEndpointMethods)

export const config = {
    runtime: 'edge'
}

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
})

export default async (request, response) => {
    switch (request.method) {
        case 'GET':
            return await GET(request, response);
        default:
            return response.status(405)
                .send({error: 'Method not allowed'});
    }
};

async function GET(request) {
    const requestUrl = new URL(request.url)
    if (requestUrl.pathname === '/') {
        return new Response('Starline API', {
            status: 308,
            headers: {
                'Location': `https://github.com/${starlineConfig.repository.owner}/${starlineConfig.repository.repo}`,
                'Cache-Control': 'public, max-age=0, s-maxage=604800'
            }
        })
    }

    const sourceRepository = requestUrl.pathname.replace(/^\//, '')
    if (sourceRepository.split('/').length !== 2) {
        return new Response('Invalid repository', {
            status: 400,
            headers: {
                'Cache-Control': 'public, max-age=0, s-maxage=604800'
            }
        })
    }
    const sourceRepositoryObject = parseRepository(sourceRepository)
    if (!await repositoryExists(sourceRepositoryObject)) {
        return new Response('Not found', {
            status: 404,
            headers: {
                'Cache-Control': 'public, max-age=0, s-maxage=60'
            }
        })
    }

    const starlineImage = await downloadGithubReleaseAsset({
        ...starlineConfig.repository,
        releaseTag: starlineConfig.cache.releaseTag,
        fileName: `${sourceRepository}/${starlineConfig.files.image.name}`,
    })

    if (!starlineImage) {
        console.log('Create starline image...')
        waitUntil(triggerStarlineWorkflow(sourceRepository))

        const svg = createLoadingSvg()
        return new Response(svg, {
            status: 202,
            headers: {
                'Content-Type': starlineConfig.files.image.contentType,
                'Cache-Control': `public, max-age=0, s-maxage=${starlineConfig.cache.maxAgeAfterTrigger}`
            }
        })
    } else {
        let cacheMaxAge = starlineConfig.cache.maxAge
        if (starlineImage.age > cacheMaxAge) {
            console.log('Refresh starline image...')
            waitUntil(triggerStarlineWorkflow(sourceRepository))
            cacheMaxAge = starlineConfig.cache.maxAgeAfterTrigger
        }

        return new Response(starlineImage.data, {
            status: 200,
            headers: {
                'Content-Type': starlineConfig.files.image.contentType,
                'Cache-Control': `public, max-age=0, s-maxage=${cacheMaxAge}`
            }
        })
    }
}

async function triggerStarlineWorkflow(repository) {
    console.log('Trigger starline workflow')
    if (await isStarlineWorkflowRunning(repository)) {
        console.log('  Skip - Workflow is already running')
        return
    }

    return await octokit.rest.actions.createWorkflowDispatch({
        ...starlineConfig.repository,
        workflow_id: starlineConfig.workflow.id,
        ref: starlineConfig.workflow.ref,
        inputs: {
            repository
        }
    })
}

async function isStarlineWorkflowRunning(repository) {
    const workflowsResponse = await octokit.rest.actions.listWorkflowRuns({
        ...starlineConfig.repository,
        status: 'in_progress',
        workflow_id: starlineConfig.workflow.id,
        per_page: 64
    })
    return workflowsResponse.data.workflow_runs
        .some((run) => run.name.endsWith(` ${repository}`))
}

