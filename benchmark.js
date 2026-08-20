const { performance } = require('perf_hooks');

function testFilter(list, domain) {
    return list.filter(d => d !== domain);
}

function testSplice(list, domain) {
    const idx = list.indexOf(domain);
    if (idx !== -1) {
        list.splice(idx, 1);
    }
    return list;
}

const listSize = 1000;
const iterations = 10000;

// Reduce memory footprint by re-generating the array on the fly or testing smaller iterations
let start = performance.now();
for (let i = 0; i < iterations; i++) {
    const list = Array.from({ length: listSize }, (_, i) => `domain${i}.com`);
    testFilter(list, 'domain500.com');
}
let end = performance.now();
console.log(`Baseline (filter) + list creation: ${end - start} ms`);

start = performance.now();
for (let i = 0; i < iterations; i++) {
    const list = Array.from({ length: listSize }, (_, i) => `domain${i}.com`);
    testSplice(list, 'domain500.com');
}
end = performance.now();
console.log(`Optimized (splice) + list creation: ${end - start} ms`);

// Only measure filter/splice
let baselineTime = 0;
for (let i = 0; i < iterations; i++) {
    const list = Array.from({ length: listSize }, (_, i) => `domain${i}.com`);
    let t0 = performance.now();
    testFilter(list, 'domain500.com');
    baselineTime += performance.now() - t0;
}
console.log(`Baseline (filter) pure: ${baselineTime} ms`);

let optTime = 0;
for (let i = 0; i < iterations; i++) {
    const list = Array.from({ length: listSize }, (_, i) => `domain${i}.com`);
    let t0 = performance.now();
    testSplice(list, 'domain500.com');
    optTime += performance.now() - t0;
}
console.log(`Optimized (splice) pure: ${optTime} ms`);
