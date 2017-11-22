var z = require('zero-fill')
  , n = require('numbro');

module.exports = function container (get, set, clear) {
  return {
    name: 'ta_bbands',
    description: 'Add description.',

    getOptions: function () {
      this.option('period', 'period length', String, '1h');
      this.option('min_periods', 'min. number of history periods', Number, 52);
      this.option('ma_period', 'number of periods for the shorter EMA', Number, 20);
    },

    calculate: function (s) {
      get('lib.ta_bbands')(s, 'upper_band', 'middle_band', 'lower_band', s.options.ma_period);
    },

    onPeriod: function (s, cb) {
      // TODO add buy and sell signals
      cb();
    },

    onReport: function (s) {
      var cols = [];
      if (typeof s.period.upper_band === 'number' && typeof s.period.middle_band === 'number' && typeof s.period.lower_band === 'number') {
        cols.push(z(8, n(s.period.upper_band).format('+00.0000'), ' ').cyan);
        cols.push(z(8, n(s.period.middle_band).format('+00.0000'), ' ').cyan);
        cols.push(z(8, n(s.period.lower_band).format('+00.0000'), ' ').cyan);

      }
      else {
        cols.push('         ');
      }
      return cols;
    }
  };
};
