let semver = require('semver');
let version = require('./package.json').version;
const USER_AGENT = 'zenbot/' + version;
let program = require('commander');
program.version(version);
program._name = 'zenbot';

let versions = process.versions;

if (semver.gt('6.0.0', versions.node)) {
  console.log('You are running a node.js version older than 6.x, please upgrade via https://nodejs.org/en/');
  process.exit(1);
}

let fs = require('fs')
  , path = require('path')
  , boot = require('./boot');

boot(function (err, zenbot) {
  let command_name = process.argv[2];
  if (err) {
    throw err;
  }
  let commands = zenbot.get('zenbot:commands.list');
  commands.forEach(function (command) {
    command(program);
  });
  let command_found = false;
  try {
    zenbot.get('zenbot:commands.' + command_name);
    command_found = true;
  }
  catch (e) {
  }
  if (!command_name || !command_found && (!process.argv[2] || !process.argv[2].match(/^-V|--version$/))) {
    program.help();
  }
  program.parse(process.argv);
});
