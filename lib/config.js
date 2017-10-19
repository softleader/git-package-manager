const promisify = require("promisify-node");
const fs = promisify(require("fs-extra"));
const inquirer = require('inquirer');
const path = require("path");
const homedir = require('homedir');
const config = path.resolve(homedir(), ".rpm");
const yaml = require('js-yaml');

exports.file = () => {
  try {
    return JSON.parse(fs.readFileSync(config));
  } catch (err) {
    throw Error('rpm:  use \'rpm login\' to config auth information.');
  }
};

exports.init = () => {
  inquirer
    .prompt(questions())
    .then(answers => {
      const cfg = {};
      cfg.token = answers.token;
      cfg.yamlPath = answers.yaml ? answers.yaml : path.resolve(homedir(), "package.yaml");;
      fs.writeFileSync(config, JSON.stringify(cfg));
      console.log("Created '" + config + "'.");

      const newYaml = yaml.safeDump({
        name: answers.name,
        version: answers.version,
        description: answers.description,
        dependencies: dependencies()
      });
      fs.writeFileSync(cfg.yamlPath, newYaml);
      console.log("Created '" + cfg.yamlPath + "'.");
    });
};

const required = (value) => {
  const valid = !!value && value.replace(/\s/g, '').length > 0;
  return valid || 'is required';
};

const questions = () => {
  return [
    {
      type: 'input',
      name: 'token',
      message: 'token:',
      validate: required
    }, {
      type: 'input',
      name: 'yaml',
      message: 'package.yaml path(default: ' + path.resolve(homedir(), "package.yaml") + '):'
    }, {
      type: 'input',
      name: 'name',
      message: 'name:',
      validate: required
    }, {
      type: 'input',
      name: 'version',
      message: 'version:',
      validate: required
    }, {
      type: 'input',
      name: 'description',
      message: 'description:',
      validate: required
    }
  ];
};

const dependencies = () => {
  return [
    {'softleader-security-user-rpc': '^v1.0.0'},
    {'softleader-security-role-rpc': '^v1.0.0'}
  ];
};