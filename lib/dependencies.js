const remote = require("./remote");
const path = require("path");
const yaml = require('js-yaml');
const fs = require("fs-extra");
const format = require('string-format');
const chalk = require('chalk');
const version = require('./version');
const gh = require('./gh');
const extend = require('extend');

exports.install = (repos, options) => {

  // bind additional function
  options.repositories = {};
  options.repositoryGroups = {}; 
  options.analyzeRepository = repo => { // make caches
    let analyzed = options.repositories[repo]
    if (!analyzed) {
      options.repositories[repo] = analyzed = gh.analyze(repo);
    }
    return analyzed;
  }

  // regist Array flatMap
  Array.prototype.flatMap = function(lambda) {
    return Array.prototype.concat.apply([], this.map(lambda));
  };

  let extending = analyzeYamlFile(options.extend);
  if (!!extending && extending.isOnGithub) {;
      gh.contents(extending, extending.contents, extending.analyzeTag, (opt, content, output, body, header) => {
        fs.outputFileSync(body.name, output);
        options.extend = body.name;
        preInstall(repos, options);
      });
  } else {
    preInstall(repos, options);
  }
};

const preInstall = (repos, options) => {
  // if yaml file is on github, clone file before install  
  let yaml = analyzeYamlFile(options.yamlFile);
  if (yaml.isOnGithub) {
    gh.contents(yaml, yaml.contents, yaml.analyzeTag, (opt, content, output, body, header) => {
      // console.log("Retrieved [%s] from GitHub: '%s/%s#%s'...", content, opt.owner, opt.repo, opt.targetVersion);
      fs.outputFileSync(body.name, output);
      options.yamlFile = body.name;
      _install(repos, options);
    });
  } else {
    _install(repos, options);
  }
}

const analyzeYamlFile = path => {
  if (!path) {
    return path;
  }
  let yaml = {
    isOnGithub: path.startsWith('github:')
  }
  if (yaml.isOnGithub) {
    let result = /^github:(.+?)\/(.+?)\/(.+)/g.exec(path);
    yaml.owner = result[1];
    yaml.repo = result[2];
    let splited = result[3].includes("#") ? result[3].split('#') : result[3].split('@');
    yaml.contents = splited[0];
    yaml.versionRange = splited[1];
    yaml.isTag = !!result[3].includes("@");
  }
  return yaml;
}

const extendYaml = options => {
  if (options.yaml && options.extend) {
    console.log("Extending [%s] to [%s]", options.extend, options.yamlFile);
    let extending = safeLoadYaml(options.extend);
    extend(true, options.yaml, extending);
  }
}

const _install = (ownerRepos, options) => {
  // retrieve yaml
  options.yaml = safeLoadYaml(options.yamlFile);
  extendYaml(options);
  if(ownerRepos.length > 0) { // gpm install owner/repository
    ownerRepos.forEach(ownerRepo => {
      let analyzed = options.analyzeRepository(ownerRepo);
      options.repositoryGroups[format("{}/{}", analyzed.owner, analyzed.repo)] = options.group;
      installDependency(ownerRepo, options);
    });
  } else { // gpm install
    const yamlDependencies = options.yaml.dependencies;
    let dependencies;
    if(yamlDependencies instanceof Array) { // no group
      dependencies = options.yaml.dependencies;
    } else { // group
      console.log("Detected groups in YAML dependencies!")
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
      options.repositoryGroups[key] = dependency.group ? dependency.group : "";
      return key + (targetDependency[key].includes("#") ? "" : "@") + targetDependency[key];
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
  const analyzed = options.analyzeRepository(ownerRepo);
  const owner = analyzed.owner,
        repo = analyzed.repo;

  const group = options.group ? options.group : options.repositoryGroups[format("{}/{}", owner, repo)];
  const clonePath = path.join(path.resolve("", options.installDir), group, repo);

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

const cloneGithub = (url, clonePath, ownerRepo, options) => {
  gh.clone(ownerRepo, url, clonePath, (opt, data) => {
    if(opt.isTag) {
      updateYaml(format("{}/{}", opt.owner, opt.repo), opt.versionRange, opt.targetVersion, options);
    } else {
      updateYaml(format("{}/{}", opt.owner, opt.repo), "#" + opt.versionRange, undefined, options);
    }
  });
};

const cloneGithubWithSpecifyFile = (clonePath, ownerRepo, options) => {
  gh.contents(ownerRepo, options.contents, options.analyzeTag, (opt, content, output) => {
    if(opt.isTag) {
      updateYaml(format("{}/{}", opt.owner, opt.repo), opt.versionRange, opt.targetVersion, options);
    } else {
      updateYaml(format("{}/{}", opt.owner, opt.repo), "#" + opt.versionRange, undefined, options);
    }
    const outputFile = format("{}/{}", clonePath, content);
    if (options.filtering && options.yaml.filtering) { // begin string replace
      Object.keys(options.yaml.filtering).forEach(key => {
        let value = options.yaml.filtering[key];
        if (value === '${owner}') {
          value = opt.owner;
        } else if (value === '${repo}') {
          value = opt.repo;
        } else if (value === '${tag}') {
          if (opt.isTag) {
            value = opt.targetVersion;
          } else {
            value = 'latest';
          }
        }
        output = output
          .replace(new RegExp("\\$\\{" + key + "\\}","gm"), value)
          .replace(new RegExp("@" + key + "@","gm"), value);
      });
    }
    if (outputFile.endsWith("Containerfile")) {
      let y = yaml.safeLoad(output)
      Object.values(y.swarm).forEach(svc => {
        if (!svc.deploy) {
          svc.deploy = {};
        }
        if (!svc.deploy.labels) {
          svc.deploy.labels = {};
        }
        svc.deploy.labels['github'] = format("{}/{}", opt.owner, opt.repo);
      });
      output = yaml.safeDump(y)
    }
    fs.outputFile(outputFile, output);
  });
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
    group = options.repositoryGroups[ownerRepo],
    yamlVersion = version.matchAllVersionRange(originVersion) ? "^" + targetVersion : originVersion,
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
