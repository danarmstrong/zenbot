module.exports = {
  _ns: 'zenbot',

  'strategies.ema_crossover': require('./strategy'),
  'strategies.list[]': '#strategies.ema_crossover'
}
