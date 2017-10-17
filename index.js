#!/usr/bin/env node

var program = require('commander');
var fs = require("fs-extra");
var pjson = require('./package.json');
var remote = require('./lib/remote');
var dependencies = require('./lib/dependencies');
var entry = Object.keys(pjson.bin)[0];

function collect(val, collection) {
  collection.push(val);
  return collection;
}

function bool(val) {
  return val == 'true';
}

program
.command('remote <repository...>')
.description('Add remote & token')
.option('-t, --token <token>', 'token to access the remote')
.action(remote.add);

program
.command('search [repository]')
.description('Searches repository in remotes')
.action(remote.search);

program
.command('install [repository...]')
.option('--save', 'save changes to package.yaml', false)
.description('Install repository')
.action(dependencies.install);

program
.command('uninstall <repository...>')
.option('--save', 'save changes to package.yaml', false)
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