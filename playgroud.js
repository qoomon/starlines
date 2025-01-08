import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import {createSvg} from "./starline-svg.js";

const sources = [
    'qoomon--starlines',
    'denoland--deno',
    'oven-sh--bun',
    'gists--5dfcdf8eec66a051ecd85625518cfd13',
]

sources.forEach(source => {
    const stargazers = JSON.parse(readFileSync(`${source}--stargazer-dates.json`)).map(it => new Date(it));
    console.log('stargazers:',stargazers.length);

    const svg = createSvg(stargazers);
    writeFileSync(`./${source}--starline.svg`, svg);
})