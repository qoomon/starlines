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

export async function getLogin(user) {
    try {
        const response = await octokit.rest.users.getByUsername({
          username: user,
        });
                
        return response.data.login;
    } catch (error) {
        if (error.status === 404) {
            return null;
        }
        throw error;
    }
}

export async function getOwnerRepositories(owner) {
    const repos = await octokit.paginate(octokit.rest.repos.listForUser, {
        username: owner,
        per_page: 100,
    });
    return repos.map(repo => `${repo.owner.login}/${repo.name}`);
}

export async function getOwnerGists(owner) {
    const gists = await octokit.paginate(octokit.rest.gists.listForUser, {
        username: owner,
        per_page: 100,
    });
    return gists.map(gist => `${gist.owner.login}/${gist.id}@gist`);
}
