const config = require("./config");
const remote = require("./remote");
const yaml = require('js-yaml');
const fs = require("fs-extra");
const Git = require("nodegit");
const format = require('string-format');
const semver = require('semver');

const opts = (github, checkoutBranch) => {
  return {
    checkoutBranch: checkoutBranch,
    fetchOpts: {
      callbacks: {
        credentials: function(url, userName) {
          return Git.Cred.userpassPlaintextNew(remote.file()[github].token, "x-oauth-basic");
        },
        certificateCheck: function() {
          return 1;
        }
      }
    }
  };
};

exports.install = (repos, options) => {
  if(repos instanceof Array) {
    repos.forEach(installDependency)
  } else {
    installDependency(repos);
  }
};

exports.uninstall = (repos, options) => {
  if(repos instanceof Array) {
    repos.forEach(uninstallDependency)
  } else {
    uninstallDependency(repos);
  }
};

const installDependency = (githubRepo) => {
  console.log('dependency install: ' + githubRepo);

  const yamlJson = getYamlJson();
  if(!yamlJson.dependencies) {
    yamlJson.dependencies = [];
  }

  const github = githubRepo.split("/")[0];
  let repo = githubRepo.split("/")[1],
    versionRange = "*",
    githubRepoNoVersion = githubRepo;
  if(repo.includes("@")) {
    versionRange = repo.split("@")[1];
    repo = repo.split("@")[0];
    githubRepoNoVersion = githubRepo.split("@")[0];
  }

  const url = format(remote.file()[github].remote, repo);
  const clonePath = config.clonePath() + "/" + repo;

  deleteFolderRecursive(clonePath);

  console.log("clone git repository from '%s'", url);
  Git.Clone(url, clonePath, opts(github)).then(repository => {
    return Git.Tag.list(repository).then(tags => {
      const version = getVersion(tags, versionRange);

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
              updateYaml(githubRepoNoVersion, yamlJson, "^" + version);
              return repository.setHeadDetached(commit, repository.defaultSignature, "Checkout: HEAD " + commit.id());
            });
        });
    });
  });
};

const uninstallDependency = (githubRepo) => {
  console.log('dependency uninstall: ' + githubRepo);

  const repo = githubRepo.split("/")[1];
  const clonePath = config.clonePath() + "/" + repo;
  deleteFolderRecursive(clonePath);

  const yamlJson = getYamlJson();
  yamlJson.dependencies = yamlJson.dependencies.filter(dependency => dependency[githubRepo] ? undefined : dependency);
  writeYaml(yamlJson);
};

const getVersion = (versions, versionRange) => {
  const findRegx = "(.RELEASE)$|(.RC)$";
  const n = versionRange.lastIndexOf(".");
  const extension = n === -1 ? ".RELEASE" : "." + versionRange.substring(n + 1);
  // console.log(semver.maxSatisfying(["v1.0.0","v1.0.1","v2.0.4","v2.0.2"], "*"));
  versions = versions.filter(version => version.match(findRegx)).map(version =>
    version.replace(new RegExp(findRegx,"gm"), ""));

  if(versions && versions.length > 0) {
    const targetVersion = semver.maxSatisfying(
      versions, versionRange.replace(new RegExp(findRegx,"gm"), ""))  + extension;
    console.log("find matched version: %s", targetVersion);
    return targetVersion;
  }
  return "no 'RELEASE or RC' tag";
};

const updateYaml = (githubRepo, yamlJson, version) => {
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
  return yaml.safeLoad(fs.readFileSync(config.yamlPath(), 'utf8'));
};

const writeYaml = (yamlJson) => {
  const newYaml = yaml.safeDump(yamlJson);
  fs.writeFileSync(config.yamlPath(), newYaml);
  console.log("Updated '" + config.yamlPath() + "'.");
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