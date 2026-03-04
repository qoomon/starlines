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
    const userResponse = await fetch(`https://api.github.com/users/${user}`);

    if(userResponse.status === 200 || userResponse.status === 304) {
        return await userResponse.json().then((data) => data.login);
    }

    return null;
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
    return gistOwner === owner;
}

export async function getGistOwner(gist) {
    return fetch(`https://gist.github.com/${gist}`, {redirect: 'manual'})
        .then((res) => {
            if (res.status === 301 || res.status === 302) {
                return res.headers.get('location')
                        .match(/https:\/\/gist\.github.com\/(?<owner>[^/]+)/)
                        ?.groups?.owner
                    ?? null;
            }
            return null;
        });
}

const params = new URLSearchParams({
  path: "qoomon/starline/starline.svg",
  sha: "assets",
  page: 1,
  per_page: 1
});

export async function getGitHubFileMeta({ owner, repo, ref, path}) {
  const params = new URLSearchParams({
    path: path,
    sha: ref,
    page: 1,
    per_page: 1
  });

  const url = `https://api.github.com/repos/${owner}/${repo}/commits?${params}`;
  
  const response = await fetch(url, { headers: { 'Accept': 'application/vnd.github.v3+json' }});

  if (!response.ok) {
    if (response.status !== 404) {
      return null;
    }
    throw new Error(`HTTP ${response.status}`);
  }
    
  const data = await response.json();
  if (data.length === 0) {
    return null;
  }
  return {
    lastModified: new Date(data[0].commit.committer.date),
  }
}

export async function downloadGitHubFile({ owner, repo, ref, path }) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.arrayBuffer();  
} 