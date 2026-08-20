const { performance } = require('perf_hooks');

function setupHistory(size) {
  const history = [];
  for (let i = 0; i < size; i++) {
    history.push({ id: `id_${i}`, data: `data_${i}` });
  }
  return history;
}

function deleteHistoryItemFilter(history, id) {
  return history.filter(item => item.id !== id);
}

function deleteHistoryItemSplice(history, id) {
  const index = history.findIndex(item => item.id === id);
  if (index !== -1) {
    history.splice(index, 1);
  }
  return history;
}

function runBenchmark() {
  const size = 100000;
  const runs = 100;

  console.log(`Setting up ${runs} arrays of size ${size}...`);
  const arraysForFilter = [];
  const arraysForSplice = [];
  for (let i = 0; i < runs; i++) {
    arraysForFilter.push(setupHistory(size));
    arraysForSplice.push(setupHistory(size));
  }

  // Find an item near the beginning (10% in) to show findIndex short-circuiting
  const idToFind = `id_${Math.floor(size * 0.1)}`;

  console.log("Running Filter benchmark...");
  let start1 = performance.now();
  for(let k=0; k<runs; k++) {
    deleteHistoryItemFilter(arraysForFilter[k], idToFind);
  }
  let end1 = performance.now();
  const filterTime = end1 - start1;
  console.log(`Filter (${runs} runs): ${filterTime.toFixed(2)}ms`);

  console.log("Running Splice benchmark...");
  let start2 = performance.now();
  for(let k=0; k<runs; k++) {
    deleteHistoryItemSplice(arraysForSplice[k], idToFind);
  }
  let end2 = performance.now();
  const spliceTime = end2 - start2;
  console.log(`Splice (${runs} runs): ${spliceTime.toFixed(2)}ms`);

  console.log(`Improvement: ${(filterTime / spliceTime).toFixed(2)}x faster`);
}

runBenchmark();
