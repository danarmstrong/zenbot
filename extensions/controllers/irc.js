let irc = require('irc');

module.exports = function container(get, set, clear) {
  let c = {};
  let client = null;
  let connected = false;

  function parseCommand(command, engine, s) {
    switch (command) {
      case 'b':
        client.say(c.owner, 'BUY [limit]');
        engine.executeSignal('buy');
        break;
      case 'B':
        client.say(c.owner, 'BUY [market]');
        engine.executeSignal('buy', null, null, false, true);
        break;
      case 's':
        client.say(c.owner, 'SELL [limit]');
        engine.executeSignal('sell');
        break;
      case 'S':
        client.say(c.owner, 'SELL [market]');
        engine.executeSignal('sell', null, null, false, true);
        break;
      case 'c':
      case 'C':
        client.say(c.owner, 'Cancel order');
        delete s.buy_order;
        delete s.sell_order;
        break;
      default:
        client.say(c.owner, 'Unknown command: ' + command);

    }
  }

  return {
    initialize: function (config, engine, s) {
      c = config;

      //let engine = get('lib.engine')(s);
      client = new irc.Client(config.server, config.nick, {
        userName: 'zenbot',
        realName: 'zenbot',
      });

      client.addListener('registered', function () {
        connected = true;
        if (config.password) {
          client.say('nickserv', 'identify ' + config.password);
        }

        client.join(config.channelPassword ? config.channel + ' ' + config.channelPassword : config.channel, function () {
          client.say(config.channel, 'Zenbot awaiting orders!');
        });
      });

      client.addListener('pm', function (from, message) {
        if (from !== config.owner) {
          return;
        }

        parseCommand(message, engine, s);
      });

      client.addListener('message' + config.channel, function (from, message) {
        let parts = message.split(' ');
        if (from !== config.owner || parts.length !== 2) {
          return;
        }

        if (parts[0] === '@zenbot') {
          parseCommand(parts[1]);
        }

      });

      client.addListener('error', function (message) {
        console.log('IRC ERROR: ', message);
      });
    },

    notify: function (config, message) {
      if (!connected)
        return;
      client.say(config.channel, message);
    }
  };
};
