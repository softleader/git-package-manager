#!/usr/bin/env node

const program = require('commander');
const pjson = require('./package.json');
const remote = require('./lib/remote');
const dependencies = require('./lib/dependencies');
const config = require('./lib/config');
const entry = Object.keys(pjson.bin)[0];


const collect = (val, collection) => {
  collection.push(val);
  return collection;
}

program
  .command('remote [owners...]')
  .option('-t, --token [token]', 'Access token for remotes')
  .description('Save GitHub remote owner & access token')
  .action(remote.add);

program.command('init')
  .description('Interactively create a package.yaml file')
  .action(config.init);

program
  .command('install [repository...]')
  .description('Install a repository <owner>/<repository>[@tag]')
  .option('-c, --contents <path>', 'specify the contents of a file to retrieve in each repository', collect, [])
  .option('-F, --filtering', 'activete content filtering, only applies to contents of specifying files')
  .option('-y, --yaml-file <path>', 'path to a YAML file, default \'package.yaml\'', 'package.yaml')
  .option('-d, --install-dir <path>', 'path to directory to install, default \'repositories\'', 'repositories')
  .action(dependencies.install);

program
  .command('uninstall <repository...>')
  .description('Remove a repository <owner>/<repository>')
  .option('-y, --yaml-file <path>', 'Path to a YAML file, default package.yaml', 'package.yaml')
  .option('--install-dir <path>', 'Path to install dir, default repositories', 'repositories')
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