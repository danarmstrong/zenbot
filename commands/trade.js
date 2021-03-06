let tb = require('timebucket')
  , minimist = require('minimist')
  , n = require('numbro')
  , fs = require('fs')
  , path = require('path')
  , spawn = require('child_process').spawn
  , moment = require('moment')
  , crypto = require('crypto')
  , readline = require('readline')
  , colors = require('colors')
  , z = require('zero-fill')
  , cliff = require('cliff');

module.exports = function container (get, set, clear) {
  let c = get('conf');
  return function (program) {
    program
      .command('trade [selector]')
      .allowUnknownOption()
      .description('run trading bot against live market data')
      .option('--conf <path>', 'path to optional conf overrides file')
      .option('--strategy <name>', 'strategy to use', String, c.strategy)
      .option('--order_type <type>', 'order type to use (maker/taker)', /^(maker|taker)$/i, c.order_type)
      .option('--paper', 'use paper trading mode (no real trades will take place)', Boolean, false)
      .option('--manual', 'watch price and account balance, but do not perform trades automatically', Boolean, false)
      .option('--non_interactive', 'disable keyboard inputs to the bot', Boolean, false)
      .option('--currency_capital <amount>', 'for paper trading, amount of start capital in currency', Number, c.currency_capital)
      .option('--asset_capital <amount>', 'for paper trading, amount of start capital in asset', Number, c.asset_capital)
      .option('--avg_slippage_pct <pct>', 'avg. amount of slippage to apply to paper trades', Number, c.avg_slippage_pct)
      .option('--buy_pct <pct>', 'buy with this % of currency balance', Number, c.buy_pct)
      .option('--sell_pct <pct>', 'sell with this % of asset balance', Number, c.sell_pct)
      .option('--markup_pct <pct>', '% to mark up or down ask/bid price', Number, c.markup_pct)
      .option('--order_adjust_time <ms>', 'adjust bid/ask on this interval to keep orders competitive', Number, c.order_adjust_time)
      .option('--order_poll_time <ms>', 'poll order status on this interval', Number, c.order_poll_time)
      .option('--sell_stop_pct <pct>', 'sell if price drops below this % of bought price', Number, c.sell_stop_pct)
      .option('--buy_stop_pct <pct>', 'buy if price surges above this % of sold price', Number, c.buy_stop_pct)
      .option('--profit_stop_enable_pct <pct>', 'enable trailing sell stop when reaching this % profit', Number, c.profit_stop_enable_pct)
      .option('--profit_stop_pct <pct>', 'maintain a trailing stop this % below the high-water mark of profit', Number, c.profit_stop_pct)
      .option('--max_sell_loss_pct <pct>', 'avoid selling at a loss pct under this float', c.max_sell_loss_pct)
      .option('--max_slippage_pct <pct>', 'avoid selling at a slippage pct above this float', c.max_slippage_pct)
      .option('--rsi_periods <periods>', 'number of periods to calculate RSI at', Number, c.rsi_periods)
      .option('--poll_trades <ms>', 'poll new trades at this interval in ms', Number, c.poll_trades)
      .option('--disable_stats', 'disable printing order stats')
      .option('--reset_profit', 'start new profit calculation from 0')
      .option('--debug', 'output detailed debug info')
      .action(function (selector, cmd) {
        let raw_opts = minimist(process.argv);
        let s = {options: JSON.parse(JSON.stringify(raw_opts))};
        let so = s.options;
        delete so._;
        Object.keys(c).forEach(function (k) {
          if (typeof cmd[k] !== 'undefined') {
            so[k] = cmd[k];
          }
        });
        so.debug = cmd.debug;
        so.stats = !cmd.disable_stats;
        so.mode = so.paper ? 'paper' : 'live';
        if (cmd.conf) {
          let overrides = require(path.resolve(process.cwd(), cmd.conf));
          Object.keys(overrides).forEach(function (k) {
            so[k] = overrides[k];
          });
        }
        so.selector = get('lib.normalize-selector')(so.selector || selector || c.selector);
        let exchange_id = so.selector.split('.')[0];
        let product_id = so.selector.split('.')[1];
        let exchange = get('exchanges.' + exchange_id);
        if (!exchange) {
          console.error('cannot trade ' + so.selector + ': exchange not implemented');
          process.exit(1);
        }
        console.log('engine!');
        let engine = get('lib.engine')(s);

        let controllers = get('lib.controllers');
        controllers.initialize(engine, s);
        
        const keyMap = new Map();
        keyMap.set('b', 'limit'.grey + ' BUY'.green);
        keyMap.set('B', 'market'.grey + ' BUY'.green);
        keyMap.set('s', 'limit'.grey + ' SELL'.red);
        keyMap.set('S', 'market'.grey + ' SELL'.red);
        keyMap.set('c', 'cancel order'.grey);
        keyMap.set('m', 'toggle MANUAL trade in LIVE mode ON / OFF'.grey);
        keyMap.set('T', 'switch to \'Taker\' order type'.grey);
        keyMap.set('M', 'switch to \'Maker\' order type'.grey);
        keyMap.set('o', 'show current trade options'.grey);
        keyMap.set('O', 'show current trade options in a dirty view (full list)'.grey);
        keyMap.set('P', 'print statistical output'.grey);
        keyMap.set('X', 'exit program with statistical output'.grey);

        function listKeys() {
          console.log('\nAvailable command keys:');
          keyMap.forEach((value, key) => {
            console.log(' ' + key + ' - ' + value);
          });
        }
        
        function listOptions () {
          console.log();
          console.log(s.exchange.name.toUpperCase() + ' exchange active trading options:'.grey);
          console.log();
          process.stdout.write(z(22, 'STRATEGY'.grey, ' ') + '\t' + so.strategy + '\t' + (get('strategies.' + so.strategy).description).grey);
          console.log('\n');
          process.stdout.write([
            z(24, (so.mode === 'paper' ? so.mode.toUpperCase() : so.mode.toUpperCase()) + ' MODE'.grey, ' '),
            z(26, 'PERIOD'.grey, ' '),
            z(30, 'ORDER TYPE'.grey, ' '),
            z(28, 'SLIPPAGE'.grey, ' '),
            z(33, 'EXCHANGE FEES'.grey, ' ')
          ].join('') + '\n');
          process.stdout.write([
            z(15, (so.mode === 'paper' ? '      ' : (so.mode === 'live' && (so.manual === false || typeof so.manual === 'undefined')) ? '       ' + 'AUTO'.black.bgRed + '    ' : '       ' + 'MANUAL'.black.bgGreen + '  '), ' '),
            z(13, so.period, ' '),
            z(29, (so.order_type === 'maker' ? so.order_type.toUpperCase().green : so.order_type.toUpperCase().red), ' '),
            z(31, (so.mode === 'paper' ? 'avg. '.grey + so.avg_slippage_pct + '%' : 'max '.grey + so.max_slippage_pct + '%'), ' '),
            z(20, (so.order_type === 'maker' ? so.order_type + ' ' + s.exchange.makerFee : so.order_type + ' ' + s.exchange.takerFee), ' ')
          ].join('') + '\n');
          process.stdout.write('');
          process.stdout.write([
            z(19, 'BUY %'.grey, ' '),
            z(20, 'SELL %'.grey, ' '),
            z(35, 'TRAILING STOP %'.grey, ' '),
            z(33, 'TRAILING DISTANCE %'.grey, ' ')
          ].join('') + '\n');
          process.stdout.write([
            z(9, so.buy_pct + '%', ' '),
            z(9, so.sell_pct + '%', ' '),
            z(20, so.profit_stop_enable_pct + '%', ' '),
            z(20, so.profit_stop_pct + '%', ' ')
          ].join('') + '\n');
          process.stdout.write('');
        }              

        /* Implementing statistical Exit */
        function printTrade (quit) {
          console.log();
          let output_lines = [];
          let tmp_balance = n(s.balance.currency).add(n(s.period.close).multiply(s.balance.asset)).format('0.00000000');
          if (quit) {
            if (s.my_trades.length) {
              s.my_trades.push({
                price: s.period.close,
                size: s.balance.asset,
                type: 'sell',
                time: s.period.time
              });
            }
            s.balance.currency = tmp_balance;
            s.balance.asset = 0;
            s.lookback.unshift(s.period);
          }
          let profit = s.start_capital ? n(tmp_balance).subtract(s.start_capital).divide(s.start_capital) : n(0);
          output_lines.push('last balance: ' + n(tmp_balance).format('0.00000000').yellow + ' (' + profit.format('0.00%') + ')');
          let buy_hold = s.start_price ? n(s.period.close).multiply(n(s.start_capital).divide(s.start_price)) : n(tmp_balance);
          let buy_hold_profit = s.start_capital ? n(buy_hold).subtract(s.start_capital).divide(s.start_capital) : n(0);
          output_lines.push('buy hold: ' + buy_hold.format('0.00000000').yellow + ' (' + n(buy_hold_profit).format('0.00%') + ')');
          output_lines.push('vs. buy hold: ' + n(tmp_balance).subtract(buy_hold).divide(buy_hold).format('0.00%').yellow);
          output_lines.push(s.my_trades.length + ' trades over ' + s.day_count + ' days (avg ' + n(s.my_trades.length / s.day_count).format('0.00') + ' trades/day)');
          let last_buy;
          let losses = 0, sells = 0;
          s.my_trades.forEach(function (trade) {
            if (trade.type === 'buy') {
              last_buy = trade.price;
            }
            else {
              if (last_buy && trade.price < last_buy) {
                losses++;
              }
              sells++;
            }
          });
          if (s.my_trades.length && sells > 0) {
            output_lines.push('win/loss: ' + (sells - losses) + '/' + losses);
            output_lines.push('error rate: ' + (sells ? n(losses).divide(sells).format('0.00%') : '0.00%').yellow);
          }
          output_lines.forEach(function (line) {
            console.log(line);
          });
          if (quit) {
            let html_output = output_lines.map(function (line) {
              return colors.stripColors(line);
            }).join('\n');
            let data = s.lookback.slice(0, s.lookback.length - so.min_periods).map(function (period) {
              return {
                time: period.time,
                open: period.open,
                high: period.high,
                low: period.low,
                close: period.close,
                volume: period.volume
              };
            });
            let code = 'let data = ' + JSON.stringify(data) + ';\n';
            code += 'let trades = ' + JSON.stringify(s.my_trades) + ';\n';
            let tpl = fs.readFileSync(path.resolve(__dirname, '..', 'templates', 'sim_result.html.tpl'), {encoding: 'utf8'});
            let out = tpl
              .replace('{{code}}', code)
              .replace('{{trend_ema_period}}', so.trend_ema || 36)
              .replace('{{output}}', html_output)
              .replace(/\{\{symbol\}\}/g,  so.selector + ' - zenbot ' + require('../package.json').version);
            if (so.filename !== 'none') {
              let out_target = so.filename || 'simulations/trade_result_' + so.selector +'_' + new Date().toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/-/g, '').replace(/:/g, '').replace(/20/, '') + '_UTC.html';
              fs.writeFileSync(out_target, out);
              console.log('\nwrote'.grey, out_target);
            }
            process.exit(0);
          }
        }
        /* The end of printTrade */

        let order_types = ['maker', 'taker'];
        if (!(so.order_type in order_types) || !so.order_type) {
          so.order_type = 'maker';
        }

        let db_cursor, trade_cursor;
        let query_start = tb().resize(so.period).subtract(so.min_periods * 2).toMilliseconds();
        let days = Math.ceil((new Date().getTime() - query_start) / 86400000);
        let trades_per_min = 0;
        let session = null;
        let sessions = get('db.sessions');
        let balances = get('db.balances');
        let trades = get('db.trades');
        get('db.mongo').collection('trades').ensureIndex({selector: 1, time: 1});
        let resume_markers = get('db.resume_markers');
        get('db.mongo').collection('resume_markers').ensureIndex({selector: 1, to: -1});
        let marker = {
          id: crypto.randomBytes(4).toString('hex'),
          selector: so.selector,
          from: null,
          to: null,
          oldest_time: null
        };
        let lookback_size = 0;
        let my_trades_size = 0;
        let my_trades = get('db.my_trades');
        let periods = get('db.periods');

        console.log('fetching pre-roll data:');
        let zenbot_cmd = process.platform === 'win32' ? 'zenbot.bat' : 'zenbot.sh'; // Use 'win32' for 64 bit windows too
        let backfiller = spawn(path.resolve(__dirname, '..', zenbot_cmd), ['backfill', so.selector, '--days', days]);
        backfiller.stdout.pipe(process.stdout);
        backfiller.stderr.pipe(process.stderr);
        backfiller.on('exit', function (code) {
          if (code) {
            process.exit(code);
          }
          function getNext () {
            let opts = {
              query: {
                selector: so.selector
              },
              sort: {time: 1},
              limit: 1000
            };
            if (db_cursor) {
              opts.query.time = {$gt: db_cursor};
            }
            else {
              trade_cursor = s.exchange.getCursor(query_start); 
              opts.query.time = {$gte: query_start};
            }
            get('db.trades').select(opts, function (err, trades) {
              if (err) throw err;
              if (!trades.length) {
                console.log('---------------------------- STARTING ' + so.mode.toUpperCase() + ' TRADING ----------------------------');
                if (so.mode === 'paper') {
                  console.log('!!! Paper mode enabled. No real trades are performed until you remove --paper from the startup command.');
                }
                console.log('Press ' + ' l '.inverse + ' to list available commands.');
                engine.syncBalance(function (err) {
                  if (err) {
                    if (err.desc) console.error(err.desc);
                    if (err.body) console.error(err.body);
                    throw err;
                  }
                  session = {
                    id: crypto.randomBytes(4).toString('hex'),
                    selector: so.selector,
                    started: new Date().getTime(),
                    mode: so.mode,
                    options: so
                  };
                  sessions.select({query: {selector: so.selector}, limit: 1, sort: {started: -1}}, function (err, prev_sessions) {
                    if (err) throw err;
                    let prev_session = prev_sessions[0];
                    if (prev_session && !cmd.reset_profit) {
                      if (prev_session.orig_capital && prev_session.orig_price && ((so.mode === 'paper' && !raw_opts.currency_capital && !raw_opts.asset_capital) || (so.mode === 'live' && prev_session.balance.asset == s.balance.asset && prev_session.balance.currency == s.balance.currency))) {
                        s.orig_capital = session.orig_capital = prev_session.orig_capital;
                        s.orig_price = session.orig_price = prev_session.orig_price;
                        if (so.mode === 'paper') {
                          s.balance = prev_session.balance;
                        }
                      }
                    }
                    lookback_size = s.lookback.length;
                    forwardScan();
                    setInterval(forwardScan, c.poll_trades);
                    readline.emitKeypressEvents(process.stdin);
                    if (!so.non_interactive && process.stdin.setRawMode) {
                      process.stdin.setRawMode(true);
                      process.stdin.on('keypress', function (key, info) {
                        if (key === 'l') {
                          listKeys();
                        } else if (key === 'b' && !info.ctrl ) {
                          engine.executeSignal('buy');
                          console.log('\nmanual'.grey + ' limit ' + 'BUY'.green + ' command executed'.grey);
                        } else if (key === 'B' && !info.ctrl) {
                          engine.executeSignal('buy', null, null, false, true);
                          console.log('\nmanual'.grey + ' market ' + 'BUY'.green + ' command executed'.grey);
                        } else if (key === 's' && !info.ctrl) {
                          engine.executeSignal('sell');
                          console.log('\nmanual'.grey + ' limit ' + 'SELL'.red + ' command executed'.grey);
                        } else if (key === 'S' && !info.ctrl) {
                          engine.executeSignal('sell', null, null, false, true);
                          console.log('\nmanual'.grey + ' market ' + 'SELL'.red + ' command executed'.grey);
                        } else if ((key === 'c' || key === 'C') && !info.ctrl) {
                          delete s.buy_order;
                          delete s.sell_order;
                          console.log('\nmanual'.grey + ' order cancel' + ' command executed'.grey);
                        } else if (key === 'm' && !info.ctrl && so.mode === 'live') {
                          so.manual = !so.manual;
                          console.log('\nMANUAL trade in LIVE mode: ' + (so.manual ? 'ON'.green.inverse : 'OFF'.red.inverse));
                        } else if (key === 'T' && !info.ctrl) {
                          so.order_type = 'taker';
                          console.log('\n' + 'Taker fees activated'.bgRed);
                        } else if (key === 'M' && !info.ctrl) {
                          so.order_type = 'maker';
                          console.log('\n' + 'Maker fees activated'.black.bgGreen);
                        } else if (key === 'o' && !info.ctrl) {
                          listOptions();
                        } else if (key === 'O' && !info.ctrl) {
                          console.log('\n' + cliff.inspect(so));
                        } else if (key === 'P' && !info.ctrl) {
                          console.log('\nWriting statistics...'.grey);
                          printTrade(false);
                        } else if (key === 'X' && !info.ctrl) {
                          console.log('\nExiting... ' + '\nWriting statistics...'.grey);
                          printTrade(true);
                        } else if (info.name === 'c' && info.ctrl) {
                          // @todo: cancel open orders before exit
                          console.log();
                          process.exit();
                        }
                      });
                    }
                  });
                });
                return;
              }
              engine.update(trades, true, function (err) {
                if (err) throw err;
                db_cursor = trades[trades.length - 1].time;
                trade_cursor = exchange.getCursor(trades[trades.length - 1]);
                setImmediate(getNext);
              });
            });
          }
          engine.writeHeader();
          getNext();
        });

        let prev_timeout = null;
        function forwardScan () {
          function saveSession () {
            engine.syncBalance(function (err) {
              if (err) {
                console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - error syncing balance');
                if (err.desc) console.error(err.desc);
                if (err.body) console.error(err.body);
                console.error(err);
              }
              session.updated = new Date().getTime();
              session.balance = s.balance;
              session.start_capital = s.start_capital;
              session.start_price = s.start_price;
              session.num_trades = s.my_trades.length;
              if (!session.orig_capital) session.orig_capital = s.start_capital;
              if (!session.orig_price) session.orig_price = s.start_price;
              if (s.period) {
                session.price = s.period.close;
                let d = tb().resize(c.balance_snapshot_period);
                let b = {
                  id: so.selector + '-' + d.toString(),
                  selector: so.selector,
                  time: d.toMilliseconds(),
                  currency: s.balance.currency,
                  asset: s.balance.asset,
                  price: s.period.close,
                  start_capital: session.orig_capital,
                  start_price: session.orig_price,
                };
                b.consolidated = n(s.balance.asset).multiply(s.period.close).add(s.balance.currency).value();
                b.profit = (b.consolidated - session.orig_capital) / session.orig_capital;
                b.buy_hold = s.period.close * (session.orig_capital / session.orig_price);
                b.buy_hold_profit = (b.buy_hold - session.orig_capital) / session.orig_capital;
                b.vs_buy_hold = (b.consolidated - b.buy_hold) / b.buy_hold;
                if (so.mode === 'live') {
                  balances.save(b, function (err) {
                    if (err) {
                      console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - error saving balance');
                      console.error(err);
                    }
                  });
                }
                session.balance = b;
              }
              else {
                session.balance = {
                  currency: s.balance.currency,
                  asset: s.balance.asset
                };
              }
              sessions.save(session, function (err) {
                if (err) {
                  console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - error saving session');
                  console.error(err);
                }
                if (s.period) {
                  engine.writeReport(true);
                } else {
                  readline.clearLine(process.stdout);
                  readline.cursorTo(process.stdout, 0);
                  process.stdout.write('Waiting on first live trade to display reports, could be a few minutes ...');
                }
              });
            });
          }
          let opts = {product_id: product_id, from: trade_cursor};
          exchange.getTrades(opts, function (err, trades) {
            if (err) {
              if (err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET') {
                if (prev_timeout) {
                  console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - getTrades request timed out. retrying...');
                }
                prev_timeout = true;
              }
              else if (err.code === 'HTTP_STATUS') {
                if (prev_timeout) {
                  console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - getTrades request failed: ' + err.message + '. retrying...');
                }
                prev_timeout = true;
              }
              else {
                console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - getTrades request failed. retrying...');
                console.error(err);
              }
              return;
            }
            prev_timeout = null;
            if (trades.length) {
              trades.sort(function (a, b) {
                if (a.time > b.time) return -1;
                if (a.time < b.time) return 1;
                return 0;
              });
              trades.forEach(function (trade) {
                let this_cursor = exchange.getCursor(trade);
                trade_cursor = Math.max(this_cursor, trade_cursor);
                saveTrade(trade);
              });
              engine.update(trades, function (err) {
                if (err) {
                  console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - error saving session');
                  console.error(err);
                }
                resume_markers.save(marker, function (err) {
                  if (err) {
                    console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - error saving marker');
                    console.error(err);
                  }
                });
                if (s.my_trades.length > my_trades_size) {
                  s.my_trades.slice(my_trades_size).forEach(function (my_trade) {
                    my_trade.id = crypto.randomBytes(4).toString('hex');
                    my_trade.selector = so.selector;
                    my_trade.session_id = session.id;
                    my_trade.mode = so.mode;
                    my_trades.save(my_trade, function (err) {
                      if (err) {
                        console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - error saving my_trade');
                        console.error(err);
                      }
                    });
                  });
                  my_trades_size = s.my_trades.length;
                }
                function savePeriod (period) {
                  if (!period.id) {
                    period.id = crypto.randomBytes(4).toString('hex');
                    period.selector = so.selector;
                    period.session_id = session.id;
                  }
                  periods.save(period, function (err) {
                    if (err) {
                      console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - error saving my_trade');
                      console.error(err);
                    }
                  });
                }
                if (s.lookback.length > lookback_size) {
                  savePeriod(s.lookback[0]);
                  lookback_size = s.lookback.length;
                }
                if (s.period) {
                  savePeriod(s.period);
                }
                saveSession();
              });
            }
            else {
              saveSession();
            }
          });
          function saveTrade (trade) {
            trade.id = so.selector + '-' + String(trade.trade_id);
            trade.selector = so.selector;
            if (!marker.from) {
              marker.from = trade_cursor;
              marker.oldest_time = trade.time;
              marker.newest_time = trade.time;
            }
            marker.to = marker.to ? Math.max(marker.to, trade_cursor) : trade_cursor;
            marker.newest_time = Math.max(marker.newest_time, trade.time);
            trades.save(trade, function (err) {
              // ignore duplicate key errors
              if (err && err.code !== 11000) {
                console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - error saving trade');
                console.error(err);
              }
            });
          }
        }
      });
  };
};
