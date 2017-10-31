const remote = require("./remote");
const path = require("path");
const yaml = require('js-yaml');
const fs = require("fs-extra");
const Git = require("nodegit");
const format = require('string-format');
const semver = require('semver');
const github = require('octonode');

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

const repositoryGroup = {};

exports.install = (repos, options) => {
  // console.log(options.contents);

  // regist Array flatMap
  Array.prototype.flatMap = function(lambda) {
    return Array.prototype.concat.apply([], this.map(lambda));
  };

  // if yaml file is on github, clone file before install  
  if (options.yamlFile.startsWith('git:')) {
    let result = /^git:(.+?)\/(.+?)\/(.+)/g.exec(options.yamlFile);
    const owner = result[1];
    const repo = result[2];
    const client = !!remote.file()[owner] ? github.client(remote.file()[owner].token) : github.client();
    const ghrepo = client.repo(format("{}/{}", owner, repo));
    const splited = result[3].split('#');
    const content = splited[0];
    let version = splited.length > 1 ? splited.slice(1).join('#') : 'master';
    ghrepo.contents(content, version, (error, body, header) => {
      if (error) {
        console.error("'%s/%s@%s' error getting contents of [%s]: %s", owner, repo, version, content, error);
      } else {
        console.log("Retrieving [%s] from GitHub: '%s/%s#%s'...", content, owner, repo, version);
        fs.outputFileSync(body.name, Buffer.from(body.content, body.encoding).toString('ascii'));
        options.yamlFile = body.name;
        _install(repos, options);
      }
    });
  } else {
    _install(repos, options);
  }
};

const _install = (repos, options) => {
  // retrieve yaml
  options.yaml = safeLoadYaml(options.yamlFile);
  if(repos.length > 0) { // gpm install owner/repository
    repos.forEach(repo => {
      repositoryGroup[repo] = options.group;
      installDependency(repo, options);
    });
  } else { // gpm install
    const yamlDependencies = options.yaml.dependencies;
    let dependencies;
    if(yamlDependencies instanceof Array) { // no group
      dependencies = options.yaml.dependencies;
    } else { // group
      dependencies = Object.keys(yamlDependencies).flatMap(key => {
        if(yamlDependencies[key] instanceof Array) {
          return yamlDependencies[key].map(dependency => {
            return {group: key, repository: dependency};
          });
        }
        return [{group: "", repository: {[key]: yamlDependencies[key]}}];
      });
    }

    dependencies.map(dependency => {
      let targetDependency = dependency;
      if(dependency.repository) {
        targetDependency = dependency.repository;
      }
      const key = Object.keys(targetDependency)[0];
      repositoryGroup[key] = dependency.group ? dependency.group : "";
      return key + "@" + targetDependency[key];
    }).forEach(dependency => installDependency(dependency, options));
  }
};

exports.uninstall = (repos, options) => {
  // retrieve yaml
  options.yaml = safeLoadYaml(options.yamlFile);

  if(repos instanceof Array) {
    repos.forEach(repo => uninstallDependency(repo, options));
  } else {
    uninstallDependency(repos, options);
  }
};

const installDependency = (ownerRepo, options) => {
  const owner = ownerRepo.split("/")[0];
  let repo = ownerRepo.split("/")[1],
    versionRange = "*";
  if(repo.includes("@")) {
    versionRange = repo.split("@")[1];
    repo = repo.split("@")[0];
  }

  const url = format(remote.githubRepositoryTemplate(), owner, repo);
  const group = options.group ? options.group : repositoryGroup[format("{}/{}", owner, repo)];
  const clonePath = path.join(path.resolve("", options.installDir), group, repo);
  // console.log('clonePath: %s', clonePath);

  deleteFolderRecursive(clonePath);

  if(options.contents.length > 0) {
    console.log("Installing '%s/%s' with specify file '%s'...", owner, repo, options.contents);
    cloneGithubWithSpecifyFile(clonePath, owner, repo, versionRange, options);
  } else {
    console.log("Installing '%s/%s'...", owner, repo);
    cloneGithub(url, clonePath, owner, repo, versionRange, options);
  }
};

const uninstallDependency = (ownerRepo, options) => {
  console.log("Uninstalling '%s'...", ownerRepo);

  const repo = ownerRepo.split("/")[1];
  const group = options.group ? options.group : "";
  const clonePath = path.join(path.resolve("", options.installDir), group, repo);
  // console.log('clonePath: %s', clonePath);
  deleteFolderRecursive(clonePath);

  let yamlDependencies = options.yaml.dependencies;
  if(yamlDependencies instanceof Array) { // no group
    yamlDependencies = yamlDependencies.filter(dependency => dependency[ownerRepo] ? undefined : dependency);
  } else {
    if(yamlDependencies[group] instanceof Array) {
      yamlDependencies[group] = yamlDependencies[group].filter(dependency => dependency[ownerRepo] ? undefined : dependency);
    } else {
      delete yamlDependencies[ownerRepo];
    }
  }
  options.yaml.dependencies = yamlDependencies;

  safeWriteYaml(options.yamlFile, options.yaml);
};

const cloneGithub = (url, clonePath, owner, repo, versionRange, options) => {
  // console.log("clone git repository from '%s'", url);
  if( !fs.existsSync(clonePath) ) {
    fs.ensureDirSync(clonePath);
  }

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
            .done(() => {
              updateYaml(format("{}/{}", owner, repo), matchAllVersionRange(versionRange) ? "^" + version : versionRange, options);
              repository.setHeadDetached(commit, repository.defaultSignature, "Checkout: HEAD " + commit.id());
            });
        });
    });
  });
};

const cloneGithubWithSpecifyFile = (clonePath, owner, repo, versionRange, options) => {
  // console.log("clone git repository with specify file '%s' from '%s/%s'", options.contents, owner, repo);
  const client = !!remote.file()[owner] ? github.client(remote.file()[owner].token) : github.client();
  const ghrepo = client.repo(format("{}/{}", owner, repo));
  ghrepo.tags((error, tags, header) => {
    if (error) {
      console.error("'%s/%s' error getting tags: %s", owner, repo, error);
    } else {
      tags = tags.map(tag => tag.name);
      const version = getVersion(tags, versionRange, owner, repo, () => tags[0]);
      options.contents.forEach(content => {
        ghrepo.contents(content, version, (error, body, header) => {
          if (error) {
            console.error("'%s/%s@%s' error getting contents of [%s]: %s", owner, repo, version, content, error);
          } else {
            updateYaml(format("{}/{}", owner, repo), matchAllVersionRange(versionRange) ? "^" + version : versionRange, options);
            const outputFile = format("{}/{}", clonePath, content);
            let outputContent = Buffer.from(body.content, body.encoding).toString('ascii');
            if (options.filtering && options.yaml.filtering) { // begin string replace
              Object.keys(options.yaml.filtering).forEach(key => {
                let value = options.yaml.filtering[key];
                if (value === '${owner}') {
                  value = owner;
                } else if (value === '${repo}') {
                  value = repo;
                } else if (value === '${tag}') {
                  value = version;
                }
                outputContent = outputContent
                  .replace(new RegExp("\\$\\{" + key + "\\}","gm"), value)
                  .replace(new RegExp("@" + key + "@","gm"), value);
              });
            }
            fs.outputFile(outputFile, outputContent);
          }
        });
      });
    }
  });
};

const getVersion = (versions, versionRange, owner, repo, latestVersionSupplier) => {
  const matchVersionMessage = format("Receiving '{}/{}@{}' with version: {}", owner, repo, versionRange, "%s");
  const noMatchVersionMessage = format("'{}/{}@{}' no matched tag", owner, repo, versionRange);
  if(matchAllVersionRange(versionRange)) {
    const targetVersion = latestVersionSupplier();
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

const isYamlExistsGroup = (yaml, options) => {
  if(options.group) {
    return true;
  } else {
    return !(yaml.dependencies instanceof Array);
  }
};

const updateYaml = (ownerRepo, version, options) => {
  const isYamlContainsGroup = isYamlExistsGroup(options.yaml, options),
    group = repositoryGroup[ownerRepo];
  let targetDependency,
    allDependency = options.yaml.dependencies;
  if(isYamlContainsGroup) {
    if(group === "") {
      targetDependency = allDependency[ownerRepo];
    } else {
      targetDependency = allDependency[group] ?
        allDependency[group].find(dependency => dependency[ownerRepo]) : undefined;
    }
  } else {
    targetDependency = allDependency.find(dependency => dependency[ownerRepo]);
  }

  // console.log("isYamlContainsGroup: %s, group: %s, targetDependency exists: %s", isYamlContainsGroup, group, !!targetDependency);
  if(isYamlContainsGroup) {
    if(group === "") {
      allDependency[ownerRepo] = version;
    } else {
      if(!targetDependency) {
        if(allDependency instanceof Array && allDependency.length === 0) {
          allDependency = {};
        }
        if(!allDependency[group]) {
          allDependency[group] = [];
        }
        allDependency[group].push({[ownerRepo]: version});
      } else {
        allDependency[group] = allDependency[group].map(dependency =>
          dependency[ownerRepo] ? {[ownerRepo]: version} : dependency);
      }
    }
  } else {
    if(!targetDependency) {
      allDependency.push({[ownerRepo]: version});
    } else {
      allDependency = allDependency.map(dependency =>
        dependency[ownerRepo] ? {[ownerRepo]: version} : dependency);
    }
  }
  options.yaml.dependencies = allDependency;

  safeWriteYaml(options.yamlFile, options.yaml);
};

const safeLoadYaml = (yamlPath) => {
  yamlPath = path.resolve("", yamlPath);
  return yaml.safeLoad(fs.readFileSync(yamlPath, 'utf8'));
};

const safeWriteYaml = (yamlPath, yamlJson) => {
  yamlPath = path.resolve("", yamlPath);
  const newYaml = yaml.safeDump(yamlJson);
  fs.outputFile(yamlPath, newYaml);
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