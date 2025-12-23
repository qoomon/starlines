import {parseRepository} from "./lib/github.js";

export default  {
    repository: {
        owner: 'qoomon',
        repo: 'starlines',
    },
    cache: {
        releaseTag: 'starlines',
        maxAge: 60 * 60 * 24 * 7, // 1 day in seconds
        maxAgeUsers: 60 * 60 * 24 * 7, // 1 week in seconds
        maxAgeAfterTrigger: 60 * 1 // 1 minute in seconds
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
