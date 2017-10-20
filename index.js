#!/usr/bin/env node

const program = require('commander');
const pjson = require('./package.json');
const remote = require('./lib/remote');
const dependencies = require('./lib/dependencies');
const config = require('./lib/config');
const entry = Object.keys(pjson.bin)[0];

program
  .command('remote')
  .description('Set remote & token')
  .action(remote.add);

program.command('init')
  .description('Set init yaml')
  .action(config.init);

// program
//   .command('search [repository]')
//   .description('Searches repository in remotes')
//   .action(remote.search);

program
  .command('install [repository...]')
  // .option('--save', 'save changes to package.yaml', false)
  .description('Install repository')
  .action(dependencies.install);

program
  .command('uninstall <repository...>')
  // .option('--save', 'save changes to package.yaml', false)
  .description('Uninstall repository')
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