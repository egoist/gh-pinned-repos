const url = require('url')
const qs = require('querystring')
const aimer = require('aimer')
const { send } = require('micro')

const cache = require('lru-cache')({
  max: 1024 * 1024,
  maxAge: 86400 * 30
})

function ghPinnedRepos(username) {
  return aimer(`https://github.com/${username}`).then($ => {
    const pinned = $('.pinned-item-list-item.public')
    if (!pinned || pinned.length === 0) return []

    const result = []
    pinned.each((index, item) => {
      let language = $(item)
        .find('[itemprop="programmingLanguage"]')
        .text()

      const owner =$(item).find('.owner').text()
      const repo = $(item).find('.repo').text()
      const stars = $(item)
      .find('a[href$="/stargazers"]')
      .text()
      .trim()
      const forks = $(item)
        .find('a[href$="/network/members"]')
        .text()
        .trim()
      result[index] = {
        owner: owner || username,
        repo,
        description: $(item)
          .find('.pinned-item-desc')
          .text()
          .trim(),
        language: language || undefined,
        stars: stars || 0,
        forks: forks || 0
      }
    })
    return result
  })
}

module.exports = async function(req, res) {
  /* allow cors from any origin */
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Request-Method', '*')
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET')
  res.setHeader('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') {
    return send(res, 200)
  }

  const { query } = url.parse(req.url)
  const { username, refresh } = qs.parse(query)

  if (!username) {
    res.setHeader('Content-Type', 'text/html')
    return send(
      res,
      200,
      `
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
`
    )
  }

  let result
  const cachedResult = cache.get(username)
  if (cachedResult && !refresh) {
    result = cachedResult
  } else {
    result = await ghPinnedRepos(username)
    cache.set(username, JSON.stringify(result))
  }
  send(res, 200, result)
}
