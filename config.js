import {parseRepository} from "./lib/github.js";

export default  {
    repository: {
        owner: 'qoomon',
        repo: 'starlines',
    },
    cache: {
        releaseTag: 'starlines',
        maxAge: 604800, // 1 week
        maxAgeAfterTrigger: 60
    },
    files: {
        image: {
            name: 'starline.svg',
            contentType: 'image/svg+xml'
        },
        dates: {
            name: 'stargazer-dates.json',
            contentType: 'application/json'
        },
    },
    workflow: {
        id: 'create-starline.yaml',
        ref: 'main',
    }
}