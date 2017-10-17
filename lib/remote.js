var homedir = require('homedir');
var promisify = require("promisify-node");
var fs = promisify(require("fs-extra"));
var path = require("path");
var configfile = path.resolve(homedir(), ".rpm");

exports.config = () => {
  try {
    var config;
    if (!fs.existsSync(configfile)) {
      config = {
        "remotes": {}
      };
      fs.writeFileSync(configfile, JSON.stringify(config))
    } else {
      config = JSON.parse(fs.readFileSync(configfile));
    }
    return config;
  } catch (err) {
    console.log('Error reading config file: %s', err);
    process.exit(1);
  }
}

exports.add = (remotes, options) => {
  var config = exports.config();
  remotes.forEach(remote => {
    config.remotes[remote] = options.token
  });
  fs.writeFileSync(configfile, JSON.stringify(config));
}

exports.search = (repo, options) => {
  console.log('remote search for ' + repo);
}