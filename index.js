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
};

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
  .description('Install repositories')
  .on('--help', () => {
    console.log();
    console.log('  Synopsis:');
    console.log();
    console.log('    %s install (with no args, in package dir)', entry);
    console.log('    %s install <github owner>/<github repository>#[branch] (default branch: master)', entry);
    console.log('    %s install <github owner>/<github repository>@<tag>', entry);
    console.log();
  })
  .option('-c, --contents <path>', 'specify the contents of a file to retrieve in each repository', collect, [])
  .option('-F, --filtering', 'activete content filtering, only applies to contents of specifyied files')
  .option('-e, --extend <extend>', 'path to a extend YAML file')
  .option('-y, --yaml-file <path>', 'path to a YAML file, default \'package.yaml\'', 'package.yaml')
  .option('-l, --yaml-lock-file <path>', 'path to a YAML lock file, default \'package-lock.yaml\'', 'package-lock.yaml')
  .option('-d, --install-dir <path>', 'path to directory to install, default \'repositories\'', 'repositories')
  .option('-g, --group <group>', 'repository\'s install group, default no group', '')
  .option('-a, --analyze-tag <true or false>', 'analyze tag range (default: false)', bool, false)
  .action(dependencies.install);

program
  .command('uninstall <repository...>')
  .description('Remove a repository <github owner>/<github repository>')
  .option('-y, --yaml-file <path>', 'Path to a YAML file, default package.yaml', 'package.yaml')
  .option('-d, --install-dir <path>', 'path to directory to install, default \'repositories\'', 'repositories')
  .option('-g, --group <group>', 'repository\'s uninstall group, default no group', '')
  .action(dependencies.uninstall);

program
  .command('*')
  .action(cmd => console.log('%s: \'%s\' is not a valid command. See \'%s --help\'.', entry, cmd, entry));

program
  .on('--help', () => {
    console.log();
    console.log('  %s', pjson.homepage);
    console.log();
  })
  .version(pjson.version)
  .parse(process.argv);