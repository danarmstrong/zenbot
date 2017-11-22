module.exports = function container (get, set, clear) {
  return function stddev (s, key, length, source_key) {
    if (typeof s.period[source_key] === 'number') {
      let sum = s.period[source_key];
      let sum_len = 1;
      for (let idx = 0; idx < length; idx++) {
        if (typeof s.lookback[idx][source_key] === 'number') {
          sum += s.lookback[idx][source_key];
          sum_len++;
        }
        else {
          break;
        }
      }
      let avg = sum / sum_len;
      let var_sum = 0;
      for (let idx = 0; idx < sum_len - 1; idx++) {
        var_sum += Math.pow(s.lookback[idx][source_key] - avg, 2);
      }
      let variance = var_sum / sum_len;
      s.period[key] = Math.sqrt(variance);
    }
  };
};
