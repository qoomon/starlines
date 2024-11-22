import {min_max} from "./lib/math.js";

const height = 30
const x0 = 5
const y0 = 40
const steps = 40
const dx = 5
const basis = 1.5
const gradient = ['#3023AE', '#C86DD7']

const round = (num, digits) => +(num + Number.EPSILON).toFixed(digits)

const pointOf = (x, y) => ({
    x, y,
    norm() {
        return Math.sqrt(x * x + y * y);
    },
    unit() {
        const n = this.norm()
        return pointOf(basis * x / n, basis * y / n)
    },
    add(v) {
        return pointOf(x + v.x, y + v.y);
    },
    sub(v) {
        return pointOf(x - v.x, y - v.y);
    },
    toString() {
        return `${round(this.x, 2)} ${round(this.y, 2)}`
    }
})

function bucketDates(now, dates, n) {
    const {min: mintDate, max: maxDate} = min_max(dates);
    const buckets = Array.from({length: n}, () => []);
    return dates.reduce((acc, date) => {
        const bucketIndex = getLogarithmicIndex(mintDate, maxDate, n, date);
        acc[bucketIndex].push(date);
        return acc;
    }, buckets);

    function getLogarithmicIndex(min, max, segmentCount, value) {
        const logXStart = 1
        const logXEnd = 10
        const logXLength = logXEnd - logXStart

        const logYStart = Math.log(logXStart)
        const logYEnd = Math.log(logXEnd)
        const logYLength = logYEnd - logYStart

        const relativeXValue = (value - min) / (max - min)
        const logXValue = logXEnd - (logXLength * relativeXValue)
        const logYValue = Math.log(logXValue) - logYStart
        const relativeYValue =  logYValue / logYLength

        return Math.round((1 - relativeYValue) * (segmentCount - 1))
    }

    function getLinearIndex(min, max, segmentCount, value) {
        const length = max - min
        const relativeValue = (value - min) / length
        return Math.round(relativeValue * (segmentCount - 1))
    }
}

export function createSvg(data) {
    const yx = bucketDates(new Date(), data, steps)
        .map(bucket => bucket.length)

    const scale = Math.max(...yx) / height

    const points = []
    let x = x0
    for (let y of yx) {
        x += dx
        y = y / scale
        points.push(pointOf(x, y0 - y))
    }

    const p0 = pointOf(x0, y0)
    const p1 = points[0]
    const p2 = points[1]
    const c1 = p0.add(p1.sub(p0).unit())
    const c2 = p1.add(p0.sub(p2).unit())
    let path = `M${p0} C ${c1}, ${c2}, ${p1}`

    for (let i = 1; i < points.length; i++) {
        const p0 = points[i - 1]
        const p1 = points[i]
        const p2 = points[i + 1] || p1
        const c = p0.sub(p2).unit().add(p1)
        path += ` S ${c}, ${p1}`
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
          fill="none"/>
    <circle r="4" cx="${p0.x}" cy="${p0.y}" fill="${gradient[0]}"/>
    <circle r="4" cx="${pN.x}" cy="${pN.y}" fill="${gradient[1]}"/>      
</svg>`
}

export function createLoadingSvg() {
    return `<svg width="200" height="50" viewBox="0 0 210 50"
     xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink">
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

