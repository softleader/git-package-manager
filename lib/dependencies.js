const remote = require("./remote");
const path = require("path");
const yaml = require('js-yaml');
const fs = require("fs-extra");
// const Git = require("nodegit");
const git = require('simple-git');
const format = require('string-format');
const semver = require('semver');
const github = require('octonode');
const chalk = require('chalk');

// const opts = (owner) => {
//   return {
//     fetchOpts: {
//       callbacks: {
//         certificateCheck: function() {
//           return 1;
//         },
//         credentials: function() {
//           return Git.Cred.userpassPlaintextNew(remote.file()[owner].token, "x-oauth-basic");
//         }
//       }
//     }
//   };
// };

const repositoryGroup = {};
const repositoryMapping = {};

exports.install = (repos, options) => {
  // console.log(options.contents);

  // regist Array flatMap
  Array.prototype.flatMap = function(lambda) {
    return Array.prototype.concat.apply([], this.map(lambda));
  };

  // if yaml file is on github, clone file before install  
  if (options.yamlFile.startsWith('github:')) {
    const result = /^github:(.+?)\/(.+?)\/(.+)/g.exec(options.yamlFile);
    const owner = result[1];
    const repo = result[2];
    const client = !!remote.file()[owner] ? github.client(remote.file()[owner].token) : github.client();
    const ghrepo = client.repo(format("{}/{}", owner, repo));
    const splited = result[3].includes("#") ? result[3].split('#') : result[3].split('@');
    const content = splited[0];
    const version = splited[1];
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

const _install = (ownerRepos, options) => {
  // retrieve yaml
  options.yaml = safeLoadYaml(options.yamlFile);
  if(ownerRepos.length > 0) { // gpm install owner/repository
    ownerRepos.forEach(ownerRepo => {
      parseRepository(ownerRepo);
      repositoryGroup[format("{}/{}", repositoryMapping[ownerRepo].owner, repositoryMapping[ownerRepo].repo)] = options.group;
      installDependency(ownerRepo, options);
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

    if(options.contents.length > 0) {
      console.log("Installing '%s' with specify file '%s'...", 
      chalk.green(options.yaml.name + '@' + options.yaml.version), 
        options.contents);
    } else {
      console.log("Installing '%s'...", 
        chalk.green(options.yaml.name + '@' + options.yaml.version));
    }

    dependencies.map(dependency => {
      let targetDependency = dependency;
      if(dependency.repository) {
        targetDependency = dependency.repository;
      }
      const key = Object.keys(targetDependency)[0];
      repositoryGroup[key] = dependency.group ? dependency.group : "";
      return key + (targetDependency[key].includes("#") ? "" : "@") + targetDependency[key];
    }).forEach(dependency => {
      parseRepository(dependency);
      installDependency(dependency, options)
    });
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
  const owner = repositoryMapping[ownerRepo].owner,
    repo = repositoryMapping[ownerRepo].repo;

  // console.log(repositoryMapping);
  // console.log(repositoryGroup);
  const group = options.group ? options.group : repositoryGroup[format("{}/{}", owner, repo)];
  const clonePath = path.join(path.resolve("", options.installDir), group, repo);
  // console.log('clonePath: %s', clonePath);

  deleteFolderRecursive(clonePath);

  if(options.contents.length > 0) {
    cloneGithubWithSpecifyFile(clonePath, ownerRepo, options);
  } else {
    const url = !!remote.file()[owner] ? 
      format(remote.githubRepositoryTokenTemplate(), remote.file()[owner].token, owner, repo):
      format(remote.githubRepositoryTemplate(), owner, repo);
    cloneGithub(url, clonePath, ownerRepo, options);
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

const parseRepository = (ownerRepo) => {
  const result = /(.*)\/(.*)[@|#](.*)|(.*)\/(.*)/g.exec(ownerRepo);
  repositoryMapping[ownerRepo] = {};
  if(ownerRepo.includes("@") || ownerRepo.includes("#")) {
    repositoryMapping[ownerRepo].owner = result[1];
    repositoryMapping[ownerRepo].repo = result[2];
    repositoryMapping[ownerRepo].versionRange = result[3] ? result[3] : "master";
    repositoryMapping[ownerRepo].isTag = !!ownerRepo.includes("@");
  } else {
    repositoryMapping[ownerRepo].owner = result[4];
    repositoryMapping[ownerRepo].repo = result[5];
    repositoryMapping[ownerRepo].versionRange = "*";
    repositoryMapping[ownerRepo].isTag = true;
  }
};

const cloneGithub = (url, clonePath, ownerRepo, options) => {
  const owner = repositoryMapping[ownerRepo].owner,
    repo = repositoryMapping[ownerRepo].repo,
    versionRange = repositoryMapping[ownerRepo].versionRange;
  // console.log("clone git repository from '%s'", url);
  if( !fs.existsSync(clonePath) ) {
    fs.ensureDirSync(clonePath);
  }
  if(repositoryMapping[ownerRepo].isTag) {
    const client = !!remote.file()[owner] ? github.client(remote.file()[owner].token) : github.client();
    const ghrepo = client.repo(format("{}/{}", owner, repo));
    ghrepo.tags((error, tags, header) => {
      if (error) {
        console.error("'%s/%s' error getting tags: %s", owner, repo, error);
        process.exit(1);
      }
      tags = tags.map(tag => tag.name);
      const targetVersion = getVersion(tags, versionRange, owner, repo, () => tags[tags.length - 1]);
      git().clone(url, clonePath, ['--branch', versionRange], (err, data) => {
        if (err) {
          console.log('GitError: ', err);
          process.exit(1);
        }
        updateYaml(format("{}/{}", owner, repo), versionRange, targetVersion, options);
      });
    });
  } else { // checkout branch
    console.log(format("Receiving '{}/{}#{}'", owner, repo, versionRange));
    git().clone(url, clonePath, ['--branch', versionRange], (err, data) => {
      if (err) {
        console.log('GitError: ', err);
        process.exit(1);
      }
      updateYaml(format("{}/{}", owner, repo), "#" + versionRange, undefined, options);
    });
  }
};

const cloneGithubWithSpecifyFile = (clonePath, ownerRepo, options) => {
  const owner = repositoryMapping[ownerRepo].owner,
    repo = repositoryMapping[ownerRepo].repo,
    versionRange = repositoryMapping[ownerRepo].versionRange;

  // console.log("clone git repository with specify file '%s' from '%s/%s'", options.contents, owner, repo);
  const client = !!remote.file()[owner] ? github.client(remote.file()[owner].token) : github.client();
  const ghrepo = client.repo(format("{}/{}", owner, repo));

  ghrepo.tags((error, tags, header) => {
    if (error) {
      console.error("'%s/%s' error getting tags: %s", owner, repo, error);
    } else {
      let targetVersion;
      if(repositoryMapping[ownerRepo].isTag) {
        tags = tags.map(tag => tag.name);
        targetVersion = getVersion(tags, versionRange, owner, repo, () => tags[0]);
      } else {
        console.log(format("Receiving '{}/{}#{}'", owner, repo, versionRange));
        targetVersion = versionRange;
      }
      options.contents.forEach(content => {
        ghrepo.contents(content, targetVersion, (error, body, header) => {
          if (error) {
            console.error("'%s/%s@%s' error getting contents of [%s]: %s", owner, repo, targetVersion, content, error);
          } else {
            if(repositoryMapping[ownerRepo].isTag) {
              updateYaml(format("{}/{}", owner, repo), versionRange, targetVersion, options);
            } else {
              updateYaml(format("{}/{}", owner, repo), "#" + versionRange, undefined, options);
            }
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
                  value = targetVersion;
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
  const matchVersionMessage = format("Receiving '{}/{}@{}' with version: [{}]", owner, repo, versionRange, "%s");
  const noMatchVersionMessage = format("Error: '{}/{}@{}' no matched tag", owner, repo, versionRange);
  if(matchAllVersionRange(versionRange)) {
    const targetVersion = latestVersionSupplier();
    console.log(matchVersionMessage, targetVersion);
    return targetVersion
  }

  let findFilter,
    replaceRegx,
    extension = versionRange.includes("-") ?
      versionRange.substring(versionRange.lastIndexOf("-")) : versionRange.substring(versionRange.lastIndexOf("."));

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
    let targetVersion = semver.maxSatisfying(versions, formatVersion(versionRange, replaceRegx));
    if(targetVersion) {
      targetVersion += extension;
      console.log(matchVersionMessage, chalk.yellow((targetVersion)));
    } else {
      console.error(noMatchVersionMessage);
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

let allDependencyForLock;

const updateYaml = (ownerRepo, originVersion, targetVersion, options) => {
  const isYamlContainsGroup = isYamlExistsGroup(options.yaml, options),
    group = repositoryGroup[ownerRepo],
    yamlVersion = matchAllVersionRange(originVersion) ? "^" + targetVersion : originVersion,
    yamlVersionForLock = targetVersion ? targetVersion : originVersion;
  let targetDependency,
    allDependency = options.yaml.dependencies;

  if(!allDependencyForLock) {
    allDependencyForLock = JSON.parse(JSON.stringify(options.yaml.dependencies));
  }

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
      allDependency[ownerRepo] = yamlVersion;
      allDependencyForLock[ownerRepo] = yamlVersionForLock;
    } else {
      if(!targetDependency) {
        if(allDependency instanceof Array && allDependency.length === 0) {
          allDependency = {};
          allDependencyForLock = {};
        }
        if(!allDependency[group]) {
          allDependency[group] = [];
          allDependencyForLock[group] = [];
        }
        allDependency[group].push({[ownerRepo]: yamlVersion});
        allDependencyForLock[group].push({[ownerRepo]: yamlVersionForLock});
      } else {
        allDependency[group] = allDependency[group].map(dependency =>
          dependency[ownerRepo] ? {[ownerRepo]: yamlVersion} : dependency);
        allDependencyForLock[group] = allDependencyForLock[group].map(dependency =>
          dependency[ownerRepo] ? {[ownerRepo]: yamlVersionForLock} : dependency);
      }
    }
  } else {
    if(!targetDependency) {
      allDependency.push({[ownerRepo]: yamlVersion});
      allDependencyForLock.push({[ownerRepo]: yamlVersionForLock});
    } else {
      allDependency = allDependency.map(dependency =>
        dependency[ownerRepo] ? {[ownerRepo]: yamlVersion} : dependency);
      allDependencyForLock = allDependencyForLock.map(dependency =>
        dependency[ownerRepo] ? {[ownerRepo]: yamlVersionForLock} : dependency);
    }
  }
  options.yaml.dependencies = allDependency;
  options.yamlLock = JSON.parse(JSON.stringify(options.yaml));
  options.yamlLock.dependencies = allDependencyForLock;

  safeWriteYaml(options.yamlFile, options.yaml);
  safeWriteYaml(options.yamlLockFile, options.yamlLock);
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
