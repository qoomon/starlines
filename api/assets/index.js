import {Octokit as _Octokit} from "@octokit/core";
import {restEndpointMethods} from "@octokit/plugin-rest-endpoint-methods";
import {createLoadingSvg} from "../../starline-svg.js";
import {
    downloadGithubReleaseAsset,
    gistExists,
    parseRepository,
    repositoryExists,
    userExists
} from "../../lib/github.js";
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
export async function GET(request, context) {    
    // legacy user support
    if (context.params['0'].startsWith('users/')) {
        context.params['0'] = context.params['0'].replace('users/', '')
    }
    // legacy gist support
    if (context.params['0'].startsWith('gists/')) {
        context.params['0'] = context.params['0'].replace('gists/', '') + '@gist';
    }

    const resource = context.params['0']
    if (resource.split('/').length > 2) {
        return new Response('Bad request', {
            status: 400, headers: {
                'Cache-Control': `public, max-age=0, s-maxage=${starlineConfig.cache.maxAge}`
            }
        })
    }

    if (!await resourceExists(resource)) {
        return new Response(`Not found - ${resource}`, {
            status: 404, headers: {
                'Cache-Control': 'public, max-age=0, s-maxage=60'
            }
        })
    }

    const starlineImage = await downloadGithubReleaseAsset({
        ...starlineConfig.repository,
        releaseTag: starlineConfig.cache.releaseTag,
        fileName: `${resource}/${starlineConfig.files.image.name}`,
    })

    if (!starlineImage) {
        console.log('Create starline image...')
        await triggerStarlineWorkflow(resource)

        const loadingSvg = createLoadingSvg()
        return new Response(loadingSvg, {
            status: 202, headers: {
                'Content-Type': starlineConfig.files.image.contentType,
                'Cache-Control': `public, max-age=0, s-maxage=${starlineConfig.cache.maxAgeAfterTrigger}`,
            }
        })
    }

    let cacheMaxAge = (
        !resource.includes('/') || resource.startsWith('users/')
            ? starlineConfig.cache.maxAgeUsers
            : starlineConfig.cache.maxAge
    ) - starlineImage.age
    if (cacheMaxAge <= 0) {
        console.log('Refresh starline image...')
        await triggerStarlineWorkflow(resource)

        cacheMaxAge = starlineConfig.cache.maxAgeAfterTrigger
    }

    return new Response(starlineImage.data, {
        status: 200, headers: {
            'Content-Type': starlineConfig.files.image.contentType,
            'Last-Modified': starlineImage.lastModified.toUTCString(),
            'Cache-Control': `public, max-age=0, s-maxage=${cacheMaxAge}`,
        }
    })
}

async function triggerStarlineWorkflow(resource) {
    console.log(`Trigger starline workflow for ${resource}`)
    if (await isStarlineWorkflowRunning(resource)) {
        console.log('  Skip - Workflow is already running')
        return
    }

    return await octokit.rest.actions.createWorkflowDispatch({
        ...starlineConfig.repository,
        workflow_id: starlineConfig.workflow.id,
        ref: starlineConfig.workflow.ref,
        inputs: {
            resource
        }
    })
}

async function isStarlineWorkflowRunning(resource) {
    const workflowsResponse = await octokit.rest.actions.listWorkflowRuns({
        ...starlineConfig.repository,
        workflow_id: starlineConfig.workflow.id,
        created: '>' + subtractDaysFromDate(new Date(), 1).toISOString(),
        per_page: 64
    })
    return workflowsResponse.data.workflow_runs
        .some((run) => run.name.endsWith(` ${resource}`))
}

async function resourceExists(resource) {
    const resourceParts = resource.split('/');

    // users
    if (resourceParts.length === 1) {
        return userExists(resource);
    }

    if (resourceParts.length === 2) {
        // gists
        if (resource.endsWith('@gist')) {
            return gistExists(resource.replace(/@gist$/, ''));
        }
        // repositories
        return repositoryExists(resource);
    }

    return false;
}

function subtractDaysFromDate(date, days) {
    date.setDate(date.getDate() - days);
    return date;
}

