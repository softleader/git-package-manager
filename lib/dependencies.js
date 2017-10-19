const config = require("./config");
const yaml = require('js-yaml');
const fs = require("fs-extra");
const Git = require("nodegit");
const path = require("path");
const homedir = require('homedir');
const format = require('string-format');

let url = "git@github.com:softleader-product/{}.git";
const clonePath = path.resolve(homedir(), "repositories");
const opts = {
  fetchOpts: {
    callbacks: {
      credentials: function(url, userName) {
        return Git.Cred.userpassPlaintextNew(config.file().token, "x-oauth-basic");
      },
      certificateCheck: function() {
        return 1;
      }
    }
  }
};

exports.install = (repo, options) => {
  console.log('dependencies install: ' + repo + ', ' + options);

  const yamlPath = config.file().yamlPath;
  const yamlJson = yaml.safeLoad(fs.readFileSync(yamlPath, 'utf8'));
  if(!yamlJson.dependencies) {
    yamlJson.dependencies = [];
  }

  if(fs.existsSync(clonePath + "/.git")) {
    Git.Repository.open(clonePath).done(repository => {
      // updateYaml(repo, yamlPath, yamlJson, getVersion(repository));
    });
  } else {
    url = format(url, repo);
    console.log("clone git repository from '%s'", url);
    Git.Clone(url, clonePath, opts).done(repository => {
      // updateYaml(repo, yamlPath, yamlJson, getVersion(repository));
    });
  }
};

exports.uninstall = (repo, options) => {
  console.log('dependencies uninstall: ' + repo + ', ' + options);
};

const getVersion = (repository) => {
  // Git.Tag.list(repository).done(array => {
  //   console.log(array);
  //   // TODO: get version
  // });
  return "^v1.0.2";
};

const updateYaml = (repo, yamlPath, yamlJson, version) => {
  const dependency = yamlJson.dependencies.find(dependency => dependency[repo]);
  if(!dependency) {
    yamlJson.dependencies.push({[repo]: version});
  } else {
    yamlJson.dependencies = yamlJson.dependencies.map(dependency => dependency[repo] ? {[repo]: version} : dependency);
  }

  const newYaml = yaml.safeDump(yamlJson);
  fs.writeFileSync(yamlPath, newYaml);
  console.log("Updated '" + yamlPath + "'.");
};
