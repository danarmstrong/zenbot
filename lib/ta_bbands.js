let talib = require('talib');

module.exports = function container (get, set, clear) {

  return function ta_ema (s, upper_key, middle_key, lower_key, length) {
    if (!s.marketData) {
      s.marketData = { open: [], close: [], high: [], low: [], volume: [] };
    }
    if (s.lookback.length > s.marketData.close.length) {
      for (let i = (s.lookback.length - s.marketData.close.length) - 1; i >= 0; i--) {
        //console.log('add data')
        //s.marketData.open.push(s.lookback[i].open);
        s.marketData.close.push(s.lookback[i].close);
        //s.marketData.high.push(s.lookback[i].high);
        //s.marketData.low.push(s.lookback[i].low);
        //s.marketData.volume.push(s.lookback[i].volume);
      }
    }

    //dont calculate until we have enough data
    if (s.marketData.close.length >= length) {
      let tmpMarket = JSON.parse(JSON.stringify(s.marketData.close));
      //add current period
      tmpMarket.push(s.period.close);

      //doublecheck length.
      if (tmpMarket.length >= length) {
        talib.execute({
          name: 'BBANDS',
          startIdx: 0,
          endIdx: tmpMarket.length -1,
          inReal: tmpMarket,
          optInTimePeriod: length
        }, function (err, result) {
          if (err) {
            console.log(err);
            return;
          }
          //Result format: (note: outReal can have multiple items in the array)
          // {
          //   begIndex: 8,
          //   nbElement: 1,
          //   result: { outReal: [ 1820.8621111111108 ] }
          // }
          s.period[upper_key] = result.result.outRealUpperBand[(result.nbElement - 1)];
          s.period[middle_key] = result.result.outRealMiddleBand[(result.nbElement - 1)];
          s.period[lower_key] = result.result.outRealLowerBand[(result.nbElement - 1)];
        });
      }
    }
  };
};
