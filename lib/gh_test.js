const Octokit = require('@octokit/rest')
const client = new Octokit({
  auth: 'token a66cdd0e8552114233505d97f4ed7894f4b2c4f8'
})
const per_page = 100
const last_page = /page=(\d)+>; rel="last"/g; 

client.repos.listTags({owner: "softleader", repo: "softleader-jasmine-ui", per_page: per_page})
.then(result => {
  if (result.status != 200) {
    console.error("'%s/%s' error getting tags: %s", "softleader", "softleader-jasmine-ui");
  } else {
    console.log(result.headers.link)
    let tags = result.data.map(tag => tag.name)
    var paginated = last_page.exec(result.headers.link)
    if (!paginated) {
      console.log("no paginated:", tags.length, result.headers.link)
      return
    } 

    let promises = []
    for (page = 2; page <= paginated[1]; page++) { 
      promises.push(client.repos.listTags({owner: "softleader", repo: "softleader-jasmine-ui", page, per_page}))
    }
    console.log(promises.length)
    Promise.all(promises).then(results => {
        results.forEach(result => {
          result.data.map(tag => tag.name).forEach(name => tags.push(name))
        });
        console.log(tags.length)
      });
  }
})