const url = require('url')
const qs = require('querystring')
const aimer = require('aimer')
const {send} = require('micro')

const cache = require('lru-cache')({
  max: 1024 * 1024,
  maxAge: 86400
})

function ghPinnedRepos(username) {
  return aimer(`https://github.com/${username}`)
    .then($ => {
      const pinned = $('.pinned-repo-item.public')
      if (!pinned || pinned.length === 0) return []

      const result = []
      pinned.each((index, item) => {
        let language = $(item).find('p.mb-0').contents().get(2)
        language = language && language.data.trim()
        const forks = $(item).find('a[href$="/network"]').text().trim()
        result[index] = {
          repo: $(item).find('.repo').text(),
          owner: username,
          description: $(item).find('.pinned-repo-desc').html().trim(),
          language: language || undefined,
          stars: $(item).find('a[href$="/stargazers"]').text().trim(),
          forks: forks ? forks : 0
        }
      })
      return result
    })
}

module.exports = async function (req, res) {
  const {pathname, query} = url.parse(req.url)
  const username = qs.parse(query).username

  if (pathname === '/favicon.ico') {
    return send(res, 404, '')
  }

  if (!username) {
    res.setHeader('Content-Type', 'text/html')
    return send(res, 200, `
  <head>
    <meta charset="utf-8" />
    <title>GitHub pinned repos API</title>
  </head>
  <style>body {font-family: Helvetica, serif;margin: 30px;}</style>
  <p>GET /?username=GITHUB_USERNAME</p>

  <p>
    <form action="/">
      <input type="text" name="username" placeholder="username" />
      <button type="submit">Go!</button>
    </form>
  </p>

  <p>made by <a href="https://github.com/egoist">@egoist</a> · <a href="https://github.com/egoist/gh-pinned-repos">source code</a></p>
`)
  }

  let result
  const cachedResult = cache.get(username)
  if (cachedResult) {
    result = cachedResult
  } else {
    result = await ghPinnedRepos(username)
    cache.set(username, result)
  }
  send(res, 200, result)
}
