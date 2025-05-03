import {min_max, Point, normalize} from "./lib/math.js";
import pathDataLength from "svg-getpointatlength"

const height = 30
const x0 = 5
const y0 = 46
const steps = 40
const dx = 5
const basis = 1.5
const gradient = ['#3023AE', '#C86DD7']

export function createSvg(data) {
    let yx = bucketDates(new Date(), data, steps)

    // scale to height
    yx = normalize(yx).map(it => Math.pow(it, 0.5))
    yx = yx.map(it => it * height)

    const points = []
    let x = x0
    for (let y of yx) {
        x += dx
        points.push(new Point(x, y0 - y))
    }

    const p0 = new Point(x0, y0)
    const p1 = points[0]
    const p2 = points[1]
    const c1 = p0.add(p1.sub(p0).unit().mul(basis))
    const c2 = p1.add(p0.sub(p2).unit().mul(basis))
    let path = `M${toPathPoint(p0)} C ${toPathPoint(c1)}, ${toPathPoint(c2)}, ${toPathPoint(p1)}`

    let pathLength = 0;
    console.log("points.length:", points.length);
    if(points.length >= 2) {
        for (let i = 1; i < points.length; i++) {
            const p0 = points[i - 1]
            const p1 = points[i]
            const p2 = points[i + 1] || p1
            const c = p0.sub(p2).unit().mul(basis).add(p1)
            path += ` S ${toPathPoint(c)}, ${toPathPoint(p1)}`
        }
        pathLength = pathDataLength.getPathLengthLookup(path).totalLength
    }
   
    const pN = points.slice(-1)[0]

    return `<svg width="200" height="50" viewBox="0 0 210 50" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="stroke" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop stop-color="${gradient[0]}" offset="0%"/>
            <stop stop-color="${gradient[1]}" offset="100%"/>
        </linearGradient>
    </defs>
    <path stroke="url(#stroke)"
        stroke-width="3"
        stroke-linejoin="round"
        stroke-linecap="round"
        d="${path}"
        fill="none">
        <animate attributeName="stroke-dashoffset"
            from="${pathLength}" to="0" dur="2.2s"/>
        <animate attributeName="stroke-dasharray"
            from="${pathLength}" to="${pathLength}"/>
    </path>
    <circle r="4" cx="${p0.x}" cy="${p0.y}" fill="${gradient[0]}"/>
    <circle r="4" cx="${pN.x}" cy="${pN.y}" fill="${gradient[1]}" opacity="0">
        <animate attributeName="opacity"
            from="0" to="1" dur="0.1s" begin="2.2s" fill="freeze"/>
    </circle>
</svg>`
}

export function createLoadingSvg() {
    return `<svg width="200" height="50" viewBox="0 0 210 50" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="stroke" x1="0" y1="0" x2="100%" y2="100%" gradientUnits="userSpaceOnUse">
            <stop stop-color="${gradient[0]}" offset="0%"/>
            <stop stop-color="${gradient[1]}" offset="100%"/>
        </linearGradient>
    </defs>
    <g fill="url(#stroke)" stroke="none">
        <circle cx="20%" cy="60%" r="3">
            <animate
                    attributeName="opacity"
                    dur="4s"
                    values="0;1;0"
                    repeatCount="indefinite"
                    begin="0.3"/>
        </circle>
        <circle cx="30%" cy="60%" r="3">
            <animate
                    attributeName="opacity"
                    dur="4s"
                    values="0;1;0"
                    repeatCount="indefinite"
                    begin="0.5"/>
        </circle>
        <circle cx="40%" cy="60%" r="3">
            <animate
                    attributeName="opacity"
                    dur="4s"
                    values="0;1;0"
                    repeatCount="indefinite"
                    begin="0.7"/>
        </circle>
        <circle cx="50%" cy="60%" r="3">
            <animate
                    attributeName="opacity"
                    dur="4s"
                    values="0;1;0"
                    repeatCount="indefinite"
                    begin="0.9"/>
        </circle>
        <circle cx="60%" cy="60%" r="3">
            <animate
                    attributeName="opacity"
                    dur="4s"
                    values="0;1;0"
                    repeatCount="indefinite"
                    begin="1.1"/>
        </circle>
        <circle cx="70%" cy="60%" r="3">
            <animate
                    attributeName="opacity"
                    dur="4s"
                    values="0;1;0"
                    repeatCount="indefinite"
                    begin="1.3"/>
        </circle>
        <circle cx="80%" cy="60%" r="3">
            <animate
                    attributeName="opacity"
                    dur="4s"
                    values="0;1;0"
                    repeatCount="indefinite"
                    begin="1.5"/>
        </circle>
    </g>
</svg>`
}

function bucketDates(now, dates, n) {
    let {min: minDate, max: maxDate} = min_max(dates.map(date => date.getTime()));
    maxDate = new Date(Math.max(maxDate, new Date()));

    const bucketRanges = getLogarithmicRanges(minDate, maxDate, n)
    // const bucketRanges = getLinearRanges(minDate, maxDate, n)

    const lastRange = getRange(bucketRanges, n - 1)

    return dates.reduce((acc, date) => {
            const index = findIndex(bucketRanges, date.getTime())
            acc[index]++;
            return acc;
        }, new Array(n).fill(0))
        .map((value, index) => value / getRange(bucketRanges, index) * lastRange)

    function getRange(array, index) {
        if (index >= array.length) {
            throw new Error('Index out of range')
        }
        return array[index] - array[index + 1]
    }

    function findIndex(array, value) {
        if (value < array[0] || value > array[array.length - 1]) {
            throw new Error('Value out of range')
        }

        return array.findIndex((element) => value < element) - 1
    }

    function getLogarithmicRanges(min, max, segmentCount) {
        const logXStart = 1
        const logXEnd = 10
        const logXLength = logXEnd - logXStart

        const logYStart = Math.log(logXStart)
        const logYEnd = Math.log(logXEnd)
        const logYLength = logYEnd - logYStart

        const ranges = [max]
        for (let segmentIndex = 0; segmentIndex <= segmentCount - 1; segmentIndex++) {
            const relativeXValue = (segmentIndex + 1) / segmentCount
            const logXValue = logXEnd - (logXLength * relativeXValue)
            const logYValue = Math.log(logXValue) - logYStart
            const relativeYValue = logYValue / logYLength

            ranges.push(min + (max - min) * relativeYValue)
        }

        return ranges.reverse()
    }


    function getLinearRanges(min, max, segmentCount) {
        const ranges = []
        for (let segmentIndex = 0; segmentIndex <= segmentCount; segmentIndex++) {
            ranges.push(min + (max - min) / segmentCount * segmentIndex)
        }
        return ranges
    }
}

function toPathPoint(point) {
    const format = (num) => Number(num).toFixed(2)
    return `${format(point.x)} ${format(point.y)}`
}
