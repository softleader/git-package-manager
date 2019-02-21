const Octokit = require('@octokit/rest')
const per_page = 100
const last_page = /page=(\d)+>; rel="last"/g; 

exports.list = (token, owner, repo, callback) => {
    const client = new Octokit({
        auth: 'token ' + token
    })
    client.repos.listTags({owner, repo, per_page})
    .then(result => {
      if (result.status != 200) {
        console.error("'%s/%s' error getting tags: %s", owner, repo, result.status);
      } else {
        console.log(result.headers.link)
        let tags = result.data.map(tag => tag.name)
        var paginated = last_page.exec(result.headers.link)
        if (!paginated) {
            callback(tags)
        } 
        let promises = []
        for (page = 2; page <= paginated[1]; page++) { 
          promises.push(client.repos.listTags({owner, repo, per_page, page}))
        }
        Promise.all(promises).then(results => {
            results.forEach(result => {
              result.data.map(tag => tag.name).forEach(name => tags.push(name))
            });
            callback(tags)
          });
      }
    })
}