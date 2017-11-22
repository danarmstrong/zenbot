module.exports = {
  _ns: 'zenbot',

  'strategies.ema_envelope': require('./strategy'),
  'strategies.list[]': '#strategies.ema_envelope'
}
