const remote = require("./remote");
const github = require('octonode');
const version = require('./version');
const ghtags = require('./gh_tags');
const format = require('string-format');
const git = require('simple-git');
const fs = require("fs-extra");

exports.contents = (repo, contents, cb) => {
  let opt = typeof(repo) == "object" ? repo : this.analyze(repo);

  // console.log("clone git repository with specify file '%s' from '%s/%s'", options.contents, owner, repo);
  const client = !!remote.file()[opt.owner] ? github.client(remote.file()[opt.owner].token) : github.client();
  const ghrepo = client.repo(format("{}/{}", opt.owner, opt.repo));

  if (opt.isTag) {
    // ghrepo.tags((error, tags, header) => {
    //   if (error) {
    //     console.error("'%s/%s' error getting tags: %s", opt.owner, opt.repo, error);
    //   } else {
    //     tags = tags.map(tag => tag.name);
    //     opt.targetVersion = version.analyze(tags, opt.versionRange, opt.owner, opt.repo, () => tags[0]);
    //     _contents(ghrepo, opt, contents, cb)
    //   }
    // });
    ghtags.list(github.client(remote.file()[opt.owner].token), opt.owner, opt.repo, tags => {
      opt.targetVersion = version.analyze(tags, opt.versionRange, opt.owner, opt.repo, () => tags[0]);
      _contents(ghrepo, opt, contents, cb)
    })
  } else {
    console.log(format("Receiving '{}/{}/{}#{}'", opt.owner, opt.repo, contents, opt.versionRange));
    opt.targetVersion = opt.versionRange;
    _contents(ghrepo, opt, contents, cb)
  }
};

function _contents(ghrepo, opt, contents, cb) {
  if (!Array.isArray(contents)) {
    contents = [contents];
  }
  contents.forEach(content => {
    ghrepo.contents(content, opt.targetVersion, (error, body, header) => {
      if (error) {
        console.error("'%s/%s@%s' error getting contents of [%s]: %s", opt.owner, opt.repo, opt.targetVersion, content, error);
      } else {
        let output = Buffer.from(body.content, body.encoding).toString('ascii');
        if (cb) {
          cb(opt, content, output, body, header)
        }
      }
    });
  });
}

exports.analyze = (repo) => {
  const result = /(.*)\/(.*)[@|#](.*)|(.*)\/(.*)/g.exec(repo);
  let param = {};
  if(repo.includes("@") || repo.includes("#")) {
    param.owner = result[1];
    param.repo = result[2];
    param.versionRange = result[3] ? result[3] : "master";
    param.isTag = !!repo.includes("@");
  } else {
    param.owner = result[4];
    param.repo = result[5];
    param.versionRange = "*";
    param.isTag = true;
  }
  return param;
};

exports.clone = (repo, url, clonePath, cb) => {
  let opt = this.analyze(repo);
  
  // console.log("clone git repository from '%s'", url);
  if( !fs.existsSync(clonePath) ) {
    fs.ensureDirSync(clonePath);
  }

  if(opt.isTag) {
    // const client = !!remote.file()[opt.owner] ? github.client(remote.file()[opt.owner].token) : github.client();
    // const ghrepo = client.repo(format("{}/{}", opt.owner, opt.repo));
    // ghrepo.tags((error, tags, header) => {
    //   if (error) {
    //     console.error("'%s/%s' error getting tags: %s", opt.owner, opt.repo, error);
    //     process.exit(1);
    //   }
    //   tags = tags.map(tag => tag.name);
    //   const targetVersion = version.analyze(tags, opt.versionRange, opt.owner, opt.repo, () => tags[tags.length - 1]);
    //   git().clone(url, clonePath, ['--branch', opt.versionRange], (err, data) => {
    //     if (err) {
    //       console.error('GitError: ', err);
    //       process.exit(1);
    //     }
    //     if (cb) {
    //       cb(opt, data);
    //     }
    //   });
    // });
    ghtags.list(github.client(remote.file()[opt.owner].token), opt.owner, opt.repo, tags => {
      opt.targetVersion = version.analyze(tags, opt.versionRange, opt.owner, opt.repo, () => tags[tags.length - 1]);
      git().clone(url, clonePath, ['--branch', opt.versionRange], (err, data) => {
        if (err) {
          console.error('GitError: ', err);
          process.exit(1);
        }
        if (cb) {
          cb(opt, data);
        }
      });
    })
  } else { // checkout branch
    console.log(format("Receiving '{}/{}#{}'", opt.owner, opt.repo, opt.versionRange));
    git().clone(url, clonePath, ['--branch', opt.versionRange], (err, data) => {
      if (err) {
        console.error('GitError: ', err);
        process.exit(1);
      }
      if (cb) {
        cb(opt, data);
      }
    });
  }
};