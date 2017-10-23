const fs = require("fs-extra");
const path = require("path");
const inquirer = require('inquirer');
const homedir = require('homedir');
const configFile = path.resolve(homedir(), ".rpm");
const format = require('string-format');

exports.githubRepositoryTemplate = () => {
  return "https://github.com/{}/{}.git";
};

exports.file = () => {
  try {
    return JSON.parse(fs.readFileSync(configFile));
  } catch (err) {
    throw Error('rpm:  use \'rpm remote\' to config auth information.');
  }
};

exports.add = () => {
  inquirer
    .prompt(questions())
    .then(answers => {
      const cfg = fs.existsSync(configFile) ? exports.file() : {};
      cfg[answers.name] = {
        remote: format(exports.githubRepositoryTemplate(), answers.name, "{}"),
        token: answers.token
      };

      fs.writeFileSync(configFile, JSON.stringify(cfg));
      console.log("Created '" + configFile + "'.");
    });
};

exports.search = (repo, options) => {
  console.log('remote search for ' + repo);
};

const required = (value) => {
  const valid = !!value && value.replace(/\s/g, '').length > 0;
  return valid || 'is required';
};

const questions = () => {
  return [
    {
      type: 'input',
      name: 'name',
      message: 'name:',
      validate: required
    }, {
      type: 'input',
      name: 'token',
      message: 'token:',
      validate: required
    }
  ];
};