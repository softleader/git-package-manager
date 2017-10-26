const config = require("./config");
const remote = require("./remote");
const path = require("path");
const yaml = require('js-yaml');
const fs = require("fs-extra");
const Git = require("nodegit");
const format = require('string-format');
const semver = require('semver');
const request = require('request');
var github = require('octonode');

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
  // console.log(options.contents);
  
  // retrieve yaml
  options.yaml = safeLoadYaml(options.yamlFile);

  if(repos instanceof Array) {
    if(repos.length > 0) {
      repos.forEach(repo => installDependency(repo, options))
    } else {
      options.yaml.dependencies.map(dependency => {
        const key = Object.keys(dependency)[0];
        return key + "@" + dependency[key];
      }).forEach(repo => installDependency(repo, options));
    }
  } else {
    installDependency(repos, options);
  }
};

exports.uninstall = (repos, options) => {
  // retrieve yaml
  options.yaml = safeLoadYaml(options.yamlFile);

  if(repos instanceof Array) {
    repos.forEach(repo => uninstallDependency(repos, options));
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
  const clonePath = path.join(path.resolve("", options.installDir), repo);
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
  const clonePath = path.join(path.resolve("", options.installDir), repo);
  // console.log('clonePath: %s', clonePath);
  deleteFolderRecursive(clonePath);

  options.yaml.dependencies = yamlJson.dependencies.filter(dependency => dependency[ownerRepo] ? undefined : dependency);
  safeWriteYaml(options.yamlFile, yamlJson);
};

const cloneGithub = (url, clonePath, owner, repo, versionRange, options) => {
  // console.log("clone git repository from '%s'", url);
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
              updateYaml(format("{}/{}", owner, repo), matchAllVersionRange(versionRange) ? "^" + version : versionRange, options);
              return repository.setHeadDetached(commit, repository.defaultSignature, "Checkout: HEAD " + commit.id());
            });
        });
    });
  });
};

const cloneGithubWithSpecifyFile = (clonePath, owner, repo, versionRange, options) => {
  // console.log("clone git repository with specify file '%s' from '%s/%s'", options.contents, owner, repo);
  const client = !!remote.file()[owner] ? github.client(remote.file()[owner].token) : github.client();
  var ghrepo = client.repo(format("{}/{}", owner, repo));
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
                if (value === '${onwer}') {
                  value = onwer;
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

const updateYaml = (githubRepo, version, options) => {
  const dependency = options.yaml.dependencies.find(dependency => dependency[githubRepo]);
  if(!dependency) {
    options.yaml.dependencies.push({[githubRepo]: version});
  } else {
    options.yaml.dependencies = options.yaml.dependencies.map(dependency =>
      dependency[githubRepo] ? {[githubRepo]: version} : dependency);
  }

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