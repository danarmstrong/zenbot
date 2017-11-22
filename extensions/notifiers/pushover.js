var push = require('pushover-notifications');

module.exports = function container (get, set, clear) {
  var pushover = {
    pushMessage: function(config, title, message) {

      var p = new push({
        user: config.key,
        token: config.token,
        // httpOptions: {
        //        proxy: process.env['http_proxy'],
        //},
        // onerror: function(error) {},
        // update_sounds: true // update the list of sounds every day - will
        // prevent app from exiting.
      });

      p.send({
        message: message,
        title: title
      }, function (err, result) {
        if (err) {
          console.log('error: Push message failed, ', err);
        }
      });
    }
  };
  return pushover;
};
