import { purgeCache } from "@netlify/functions";

await purgeCache({
    siteId: 'a8291ab6-35dc-4997-90d2-4190bd6b5d8e',
    domain: 'starlines.qoo.monster',
    siteSlug: 'starlines',
    token: process.env.NETLIFY_PURGE_API_TOKEN,
});