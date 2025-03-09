import {gistExists, repositoryExists, userExists} from "./lib/github.js";

const user ='qoomon'
console.log(user, await userExists(user))

const repo ='qoomon/sandbox'
console.log(repo, await repositoryExists(repo))

const gist ='qoomon/c0cb87707757dc1b24aed9aeb4c6135f'
console.log(gist, await gistExists(gist))