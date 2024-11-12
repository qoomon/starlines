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