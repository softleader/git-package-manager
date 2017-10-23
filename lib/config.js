const fs = require("fs-extra");
const inquirer = require('inquirer');
const path = require("path");
const yaml = require('js-yaml');
const dependencies = require('./dependencies');
const yamlPath = path.resolve("", 'package.yaml');
const clonePath = path.resolve("", 'repositories');

exports.yamlPath = () => {
  return yamlPath;
};

exports.clonePath = () => {
  return clonePath;
};

exports.init = () => {
  inquirer
    .prompt(questions())
    .then(answers => {
      const newYaml = yaml.safeDump({
        name: answers.name,
        version: answers.version,
        description: answers.description
      });
      fs.writeFileSync(yamlPath, newYaml);
      console.log("Created '" + yamlPath + "'.");

      initDependencies().forEach(dependencies.install);
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

const initDependencies = () => {
  return [
    "softleader-product/softleader-security-user-rpc",
    "softleader-product/softleader-security-role-rpc",
    "softleader-product/softleader-security-user-role-mapping-rpc",
    "softleader-product/softleader-security-channel-rpc",
  ];
};