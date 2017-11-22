var z = require('zero-fill')
  , n = require('numbro');

module.exports = function container (get, set, clear) {
  return {
    name: 'ema_envelope',
    description: 'Buy when (MACD - Signal > 0) and sell when (MACD - Signal < 0).',

    getOptions: function () {
      this.option('period', 'period length', String, '1h');
      this.option('min_periods', 'min. number of history periods', Number, 52);
      this.option('ema_period', 'number of periods for the EMA', Number, 12);
      //this.option('overbought_rsi_periods', 'number of periods for overbought RSI', Number, 25);
      //this.option('overbought_rsi', 'sold when RSI exceeds this value', Number, 70);
    },

    calculate: function (s) {

      get('lib.ema')(s, 'ema_high', s.options.ema_period, 'high');
      get('lib.ema')(s, 'ema_low', s.options.ema_period, 'low');

    },

    onPeriod: function (s, cb) {

      if (typeof s.period.ema_low === 'number' && typeof s.period.ema_high === 'number'
        && typeof s.lookback[0].ema_low === 'number' && typeof s.lookback[0].ema_high === 'number') {

        //console.log('\nEMA_ENVELOPE: ', s.period.below_envelope ? 'BELOW' : s.period.above_envelope ? 'ABOVE' : 'WITHIN');
        //console.log('EMA_HIGH: ', s.period.ema_high, ' - EMA_LOW: ', s.period.ema_low);


        if (s.period.low < s.period.ema_high && s.period.open > s.period.ema_high
          && s.period.close > s.period.ema_high) {
          s.signal = 'sell';
        } else if (s.period.open < s.period.ema_low && s.period.close > s.period.ema_low
          && s.lookback[0].open < s.lookback[0].ema_low && s.lookback[0].close < s.lookback[0].ema_low) {
          s.signal = 'buy';
        } else {
          s.signal = null;
        }
      }

      cb();
    },

    onReport: function (s) {
      var cols = [];
      if (typeof s.period.ema_high === 'number' && typeof s.period.ema_low === 'number') {
        var color = 'grey';
        if (s.period.low > s.period.ema_low) {
          color = 'green';
        }
        else if (s.period.low < s.period.ema_low) {
          color = 'red';
        }
        cols.push(z(8, n(s.period.ema_high).format('+00.0000'), ' ').white/*[color]*/);
        cols.push(z(8, n(s.period.ema_low).format('+00.0000'), ' ').cyan);
      }
      else {
        cols.push('         ');
      }
      return cols;
    }
  };
};
