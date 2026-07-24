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

export async function gistExists(repository) {
    const {owner, repo} = parseRepository(repository);
    const gistOwner = await getGistOwner(repo);
    return gistOwner === owner;
}

export async function getGistOwner(gist) {
    return fetch(`https://gist.github.com/${gist}`, {redirect: 'manual'})
        .then((res) => {
            if (res.status === 301 || res.status === 302) {
                return res.headers.get('location')
                        .match(/https:\/\/gist\.github\.com\/(?<owner>[^/]+)/)
                        ?.groups?.owner
                    ?? null;
            }
            return null;
        });
}
