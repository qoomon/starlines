import {Octokit as _Octokit} from "@octokit/core";
import {restEndpointMethods} from "@octokit/plugin-rest-endpoint-methods";
import {createLoadingSvg} from "../../starline-svg.js";
import {downloadGithubReleaseAsset, repositoryExists} from "../../lib/github.js";
import starlineConfig from "../../config.js";

const Octokit = _Octokit.plugin(restEndpointMethods)

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
})

// TODO try On-demand Builders

export const config = {
    path: "/assets/*",
    cache: "manual",
};

/**
 * @param request {Request}
 * @param context {import("@netlify/functions").Context}
 * @returns {Promise<Response>}
 */
export default async (request, context) => {
    switch (request.method) {
        case 'GET':
            return await GET(request, context);
        default:
            new Response('Method not allowed', {
                status: 405,
            })
    }
};

/**
 * @param request {Request}
 * @param context
 * @returns {Promise<Response>}
 */
export
async function GET(request, context) {
    let sourceRepository = context.params['0']
    if (sourceRepository.split('/').length === 1) {
        sourceRepository = 'users/' + sourceRepository
    }

    if (sourceRepository.split('/').length !== 2) {
        return new Response('Bad request', {
            status: 400,
            headers: {
                'Cache-Control': `public, max-age=0, s-maxage=${starlineConfig.cache.maxAge}`
            }
        })
    }

    if (!await repositoryExists(sourceRepository)) {
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
        await triggerStarlineWorkflow(sourceRepository)

        const loadingSvg = createLoadingSvg()
        return new Response(loadingSvg, {
            status: 202,
            headers: {
                'Content-Type': starlineConfig.files.image.contentType,
                'Cache-Control': `public, max-age=0, s-maxage=${starlineConfig.cache.maxAgeAfterTrigger}`,
            }
        })
    }

    let cacheMaxAge = (sourceRepository.startsWith('users/')
        ? starlineConfig.cache.maxAgeUsers
        : starlineConfig.cache.maxAge
    ) - starlineImage.age
    if (cacheMaxAge <= 0) {
        console.log('Refresh starline image...')
        await triggerStarlineWorkflow(sourceRepository)

        cacheMaxAge = starlineConfig.cache.maxAgeAfterTrigger
    }

    return new Response(starlineImage.data, {
        status: 200,
        headers: {
            'Content-Type': starlineConfig.files.image.contentType,
            'Last-Modified': starlineImage.lastModified.toUTCString(),
            'Cache-Control': `public, max-age=0, s-maxage=${cacheMaxAge}`,
        }
    })

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

