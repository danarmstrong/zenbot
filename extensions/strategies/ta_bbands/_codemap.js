module.exports = {
  _ns: 'zenbot',

  'strategies.ta_bbands': require('./strategy'),
  'strategies.list[]': '#strategies.ta_bbands'
};
