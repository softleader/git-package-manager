const config = require("./config");
const remote = require("./remote");
const yaml = require('js-yaml');
const fs = require("fs-extra");
const Git = require("nodegit");
const format = require('string-format');
const semver = require('semver');
const request = require('request');

let yamlJson;

const opts = (owner) => {
  return {
    fetchOpts: {
      callbacks: {
        certificateCheck: function() {
          return 1;
        },
        credentials: function() {
          return Git.Cred.userpassPlaintextNew(remote.file()[owner].token, "x-oauth-basic");
        }
      }
    }
  };
};

exports.install = (repos, options) => {
  console.log(options.contents);
  if(repos instanceof Array) {
    if(repos.length > 0) {
      repos.forEach(repo => installDependency(repo, options))
    } else {
      getYamlJson().dependencies.map(dependency => {
        const key = Object.keys(dependency)[0];
        return key + "@" + dependency[key];
      }).forEach(repo => installDependency(repo, options));
    }
  } else {
    installDependency(repos, options);
  }
};

exports.uninstall = (repos, options) => {
  if(repos instanceof Array) {
    repos.forEach(uninstallDependency)
  } else {
    uninstallDependency(repos);
  }
};

const installDependency = (ownerRepo, options) => {
  console.log('dependency install: ' + ownerRepo);

  const owner = ownerRepo.split("/")[0];
  let repo = ownerRepo.split("/")[1],
    versionRange = "*";
  if(repo.includes("@")) {
    versionRange = repo.split("@")[1];
    repo = repo.split("@")[0];
  }

  const url = format(remote.githubRepositoryTemplate(), owner, repo);
  const clonePath = config.clonePath() + "/" + repo;

  deleteFolderRecursive(clonePath);

  if(options.contents.length > 0) {
    cloneGithubWithSpecifyFile(clonePath, owner, repo, versionRange, options.contents, options.filtering);
  } else {
    cloneGithub(url, clonePath, owner, repo, versionRange);
  }
};

const uninstallDependency = (ownerRepo) => {
  console.log('dependency uninstall: ' + ownerRepo);

  const repo = ownerRepo.split("/")[1];
  const clonePath = config.clonePath() + "/" + repo;
  deleteFolderRecursive(clonePath);

  const yamlJson = getYamlJson();
  yamlJson.dependencies = yamlJson.dependencies.filter(dependency => dependency[ownerRepo] ? undefined : dependency);
  writeYaml(yamlJson);
};

const cloneGithub = (url, clonePath, owner, repo, versionRange) => {
  console.log("clone git repository from '%s'", url);
  Git.Clone(url, clonePath, opts(owner)).done(repository => {
    Git.Tag.list(repository).then(tags => {
      const version = getVersion(tags, versionRange, owner, repo, () => tags[tags.length - 1]);

      // checkout tag
      return Git.Reference.dwim(repository, "refs/tags/" + version)
        .then(ref => {
          return ref.peel(Git.Object.TYPE.COMMIT);
        })
        .then(ref => {
          return repository.getCommit(ref);
        })
        .then(commit => {
          return Git.Checkout.tree(repository, commit, {checkoutStrategy: Git.Checkout.STRATEGY.SAFE})
            .then(() => {
              updateYaml(format("{}/{}", owner, repo), matchAllVersionRange(versionRange) ? "^" + version : versionRange);
              return repository.setHeadDetached(commit, repository.defaultSignature, "Checkout: HEAD " + commit.id());
            });
        });
    });
  });
};

const cloneGithubWithSpecifyFile = (clonePath, owner, repo, versionRange, contents, filtering) => {
  console.log("clone git repository with specify file '%s' from '%s/%s'", contents, owner, repo);

  const url = format("https://api.github.com/repos/{}/{}/tags", owner, repo);
  const fileUrl = format("https://api.github.com/repos/{}/{}/contents/{}?ref={}", owner, repo, "{}", "{}");
  const headers = {'User-Agent': 'request'};
  try {
    headers.Authorization = "token " + remote.file()[owner].token;
  } catch(e) {
    // public project, nothing to do
  }

  const printErrorMsg = (msg, error, response, body) => {
    console.error("'%s/%s@%s' -c '%s' %s, status: %s, message: %s, %s",
      owner, repo, versionRange, contents, msg, response.statusCode,
      error ? error.message : response.statusMessage,
      error ? "" : JSON.parse(body).message);
  };

  request({
    url: url,
    headers: headers
  }, (error, response, body) => {
    if(error || response.statusCode !== 200) {
      if(response.statusCode === 404 && !headers.Authorization) {
        printErrorMsg("get tags error, if this is a private repository, set remote name and token is required", error, response, body);
      } else {
        printErrorMsg("get tags error", error, response, body);
      }
    } else {
      const tags = JSON.parse(body).map(tag => tag.name);
      const version = getVersion(tags, versionRange, owner, repo, () => tags[0]);

      // get file
      contents.forEach(content => {
        request({
          url: format(fileUrl, content, version),
          headers: headers
        }, (error, response, body) => {
          if(error || response.statusCode !== 200) {
            printErrorMsg(format("get file '{}' error", content), error, response, body);
          } else {
            updateYaml(format("{}/{}", owner, repo), matchAllVersionRange(versionRange) ? "^" + version : versionRange);
            const bodyJson = JSON.parse(body);
            const outputFile = format("{}/{}/{}", config.clonePath(), repo, content);
            fs.outputFile(outputFile, bodyJson.content, bodyJson.encoding, () => {
              const yamlJson = getYamlJson();
              if(filtering && yamlJson.filtering) { // begin string replace
                fs.readFile(outputFile, "utf8", (err, data) => {
                  yamlJson.filtering.forEach(variable => {
                    const key = Object.keys(variable)[0];
                    const newData = data
                      .replace(new RegExp("\\$\\{" + key + "\\}","gm"), config.getVariableValue(variable[key]))
                      .replace(new RegExp("@" + key + "@","gm"), config.getVariableValue(variable[key]));
                    fs.outputFile(outputFile, newData);
                  })
                });
              }
            });
          }
        })
      })
    }
  });
};

const getVersion = (versions, versionRange, owner, repo, latestVersionSupplier) => {
  const matchVersionMessage = format("'{}/{}@{}' find matched version '{}'", owner, repo, versionRange, "%s");
  const noMatchVersionMessage = format("'{}/{}@{}' no matched tag", owner, repo, versionRange);
  if(matchAllVersionRange(versionRange)) {
    const targetVersion = latestVersionSupplier();
    config.setVariables(owner, repo, targetVersion);
    console.log(matchVersionMessage, targetVersion);
    return targetVersion
  }

  let findFilter,
    replaceRegx,
    extension = versionRange.substring(versionRange.lastIndexOf("."));

  if(isValidVersionExtension(extension)) { // end with number or x, X, *
    extension = "";
    replaceRegx = undefined;
    findFilter = version => isValidVersionExtension(version.substring(version.lastIndexOf(".")));
  } else { // non number or x, X, *
    replaceRegx = "(" + extension + ")$";
    findFilter = version => version.match(replaceRegx);
  }

  // console.log(semver.maxSatisfying(["v1.0.0","v1.0.1","v2.0.4","v2.0.2"], "*"));
  versions = versions.filter(findFilter).map(version => formatVersion(version, replaceRegx));
  // console.log(versions);

  if(versions && versions.length > 0) {
    const targetVersion = semver.maxSatisfying(versions, formatVersion(versionRange, replaceRegx))  + extension;
    config.setVariables(owner, repo, targetVersion);
    if(targetVersion !== "null") {
      console.log(matchVersionMessage, targetVersion);
    } else {
      console.log(noMatchVersionMessage);
    }
    return targetVersion;
  }

  console.log(noMatchVersionMessage);
  return "no matched tag";
};

const formatVersion = (version, replaceRegx) => {
  return replaceRegx ? version.replace(new RegExp(replaceRegx,"gm"), "") : version;
};

const isValidVersionExtension = (extension) => {
  return !isNaN(extension) || ".x" === extension.toLowerCase() || ".*" === extension
};

const matchAllVersionRange = (token) => {
  return "*" === token;
};

const updateYaml = (githubRepo, version) => {
  const yamlJson = getYamlJson();
  const dependency = yamlJson.dependencies.find(dependency => dependency[githubRepo]);
  if(!dependency) {
    yamlJson.dependencies.push({[githubRepo]: version});
  } else {
    yamlJson.dependencies = yamlJson.dependencies.map(dependency =>
      dependency[githubRepo] ? {[githubRepo]: version} : dependency);
  }

  writeYaml(yamlJson);
};

const getYamlJson = () => {
  if(!yamlJson) {
    yamlJson = yaml.safeLoad(fs.readFileSync(config.yamlPath(), 'utf8'));
  }
  return yamlJson;
};

const writeYaml = (yamlJson) => {
  const newYaml = yaml.safeDump(yamlJson);
  fs.outputFile(config.yamlPath(), newYaml);
  // console.log("Updated '" + config.yamlPath() + "'.");
};

const deleteFolderRecursive = (path) => {
  // console.log(path);
  if( fs.existsSync(path) ) {
    fs.readdirSync(path).forEach(function(file,index){
      const curPath = path + "/" + file;
      if(fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
};