#!/usr/bin/env node

const program = require('commander');
const pjson = require('./package.json');
const remote = require('./lib/remote');
const dependencies = require('./lib/dependencies');
const config = require('./lib/config');
const entry = Object.keys(pjson.bin)[0];


function collect(val, collection) {
  collection.push(val);
  return collection;
}

program
  .command('remote [remote...]')
  .option('-t, --token [token]', 'Access token for remotes')
  .description('Save GitHub remote & access token')
  .action(remote.add);

program.command('init')
  .description('Interactively create a package.yaml file')
  .action(config.init);

program
  .command('install [repository...]')
  .description('Install a repository <owner>/<repository>[@tag]')
  .option('-c, --contents <path>', 'Only checkout the contents of a file in each repository', collect, [])
  .action(dependencies.install);

program
  .command('uninstall <repository...>')
  .description('Remove a repository <owner>/<repository>')
  .action(dependencies.uninstall);

program
  .command('*')
  .action(cmd => console.log('%s: \'' + cmd + '\' is not a valid command. See \'%s --help\'.', entry, entry));

program
  .on('--help', () => {
    console.log();
    console.log('  %s', pjson.homepage);
    console.log();
  })
  .version(pjson.version)
  .parse(process.argv);