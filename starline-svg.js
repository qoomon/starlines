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

function bucketDates(dates, n) {
    const startDate = Math.min(...dates);
    const endDate = Math.max(...dates);
    const totalRange = endDate - startDate;
    const bucketSize = totalRange / n;

    const buckets = Array.from({length: n}, () => []);
    return dates.reduce((acc, date) => {
        const bucketIndex = Math.min(Math.floor((date - startDate) / bucketSize), n - 1);
        acc[bucketIndex].push(date);
        return acc;
    }, buckets);
}

function createTextSvg(text) {
    return `<svg width="200" height="50" viewBox="0 0 210 50" xmlns="http://www.w3.org/2000/svg">
    <text x="40" y="30">${text}</text>     
</svg>`
}

export function createSvg(data) {
    if (data.length <= steps) {
        return createTextSvg('⭐️ not enough stars')
    }

    const yx = bucketDates(data, steps)
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
    const c1 = p1.sub(p0).unit().add(p2)
    const c2 = p0.sub(p2).unit().add(p1)
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
        <linearGradient x1="0%" y1="0%" x2="100%" y2="0%" id="a">
            <stop stop-color="${gradient[0]}" offset="0%"/>
            <stop stop-color="${gradient[1]}" offset="100%"/>
        </linearGradient>
    </defs>
    <path stroke="url(#a)"
          stroke-width="3"
          stroke-linejoin="round"
          stroke-linecap="round"
          d="${path}"
          fill="none"/>
    <circle r="4" cx="${p0.x}" cy="${p0.y}" fill="${gradient[0]}"/>
    <circle r="4" cx="${pN.x}" cy="${pN.y}" fill="${gradient[1]}"/>      
</svg>`
}
