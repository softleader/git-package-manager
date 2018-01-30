const semver = require('semver');
const format = require('string-format');
const chalk = require('chalk');

exports.analyze = (versions, versionRange, owner, repo, latestVersionSupplier) => {
  const matchVersionMessage = format("Receiving '{}/{}@{}' with version: [{}]", owner, repo, versionRange, "%s");
  const noMatchVersionMessage = format("Error: '{}/{}@{}' no matched tag", owner, repo, versionRange);
  if(this.matchAllVersionRange(versionRange)) {
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

exports.matchAllVersionRange = (token) => {
  return "*" === token;
};
