const fs = require("fs-extra");
const path = require("path");
const inquirer = require('inquirer');
const homedir = require('homedir');
const configFile = path.resolve(homedir(), ".gpm");

exports.githubRepositoryTemplate = () => {
  return "https://github.com/{}/{}.git";
};

exports.githubRepositoryTokenTemplate = () => {
  return "https://{}@github.com/{}/{}.git";
};

exports.file = () => {
  try {
    return JSON.parse(fs.readFileSync(configFile));
  } catch (err) {
    throw Error('gpm: use \'gpm remote\' to config auth information.');
  }
};

exports.add = (owners, options) => {
  if (!!owners && owners.length > 0 && !!options.token) {
    addDirectly(owners, options);
  } else {
    addInteractively();
  }
};

const addDirectly = (owners, options) => {
  const cfg = fs.existsSync(configFile) ? exports.file() : {};
  owners.forEach(owner => {
    cfg[owner] = {
      token: options.token
    };
  });
  fs.writeFileSync(configFile, JSON.stringify(cfg));
  console.log("Saved '" + configFile + "'.");
}

const addInteractively = () => {
  inquirer
    .prompt(questions())
    .then(answers => {
      const cfg = fs.existsSync(configFile) ? exports.file() : {};
      cfg[answers.owner] = {
        token: answers.token
      };

      fs.writeFileSync(configFile, JSON.stringify(cfg));
      console.log("Saved '" + configFile + "'.");
    });
}

const required = (value) => {
  const valid = !!value && value.replace(/\s/g, '').length > 0;
  return valid || 'is required';
};

const questions = () => {
  return [
    {
      type: 'input',
      name: 'owner',
      message: 'owner:',
      validate: required
    }, {
      type: 'input',
      name: 'token',
      message: 'token:',
      validate: required
    }
  ];
};