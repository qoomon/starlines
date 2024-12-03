export function min_max(arr) {
    let len = arr.length;
    let max = -Infinity;
    let min = +Infinity;

    while (len--) {
        max = arr[len] > max ? arr[len] : max;
        min = arr[len] < min ? arr[len] : min;
    }
    return {
        min: min,
        max: max
    };
}

export class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    norm() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    unit() {
        const n = this.norm()
        return new Point( this.x / n, this.y / n)
    }

    add(p) {
        return new Point(this.x + p.x, this.y + p.y);
    }

    sub(p) {
        return new Point(this.x - p.x, this.y - p.y);
    }

    mul(s) {
        return new Point(this.x * s, this.y * s);
    }
}