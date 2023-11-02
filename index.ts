import LRU from "https://esm.sh/quick-lru@6.0.2";
import { serve } from "https://deno.land/std@0.121.0/http/server.ts";
import {
  Cheerio,
  cheerio,
  Root,
  TagElement,
  TextElement,
} from "https://deno.land/x/cheerio@1.0.7/mod.ts";

type Element = TagElement | TextElement;

const aimer = async (url: string) => {
  const html = await fetch(url).then((res) => res.text());
  return cheerio.load(html);
};

const cache = new LRU({
  maxSize: 500,
});

async function ghPinnedRepos(username: string) {
  const $ = await aimer(`https://github.com/${username}`);
  const pinned = $(".pinned-item-list-item").toArray();

  // if empty
  if (!pinned || pinned.length === 0) return [];

  const result: any[] = [];
  for (const [index, item] of pinned.entries()) {
    const owner = getOwner($, item);
    const repo = getRepo($, item);
    const link = "https://github.com/" + (owner || username) + "/" + repo;
    const description = getDescription($, item);
    const image = `https://opengraph.githubassets.com/1/${
      owner || username
    }/${repo}`;
    const website = await getWebsite(link);
    const language = getLanguage($, item);
    const languageColor = getLanguageColor($, item);
    const stars = parseInt(getStars($, item));
    const forks = getForks($, item);

    result[index] = {
      owner: owner || username,
      repo,
      link,
      description: description || undefined,
      image: image,
      website: website || undefined,
      language: language || undefined,
      languageColor: languageColor || undefined,
      stars: stars || 0,
      forks: forks || 0,
    };
  }
  // });
  return result;
}

function getOwner($: Cheerio & Root, item: Element) {
  try {
    return $(item).find(".owner").text();
  } catch (error) {
    return undefined;
  }
}

function getRepo($: Cheerio & Root, item: Element) {
  try {
    return $(item).find(".repo").text();
  } catch (error) {
    return undefined;
  }
}

function getDescription($: Cheerio & Root, item: Element) {
  try {
    return $(item).find(".pinned-item-desc").text().trim();
  } catch (error) {
    return undefined;
  }
}

function getWebsite(repo: string) {
  return aimer(repo)
    .then(($) => {
      try {
        const site = $(".BorderGrid-cell");
        if (!site || site.length === 0) return [];

        let href;
        site.each((index, item) => {
          if (index == 0) {
            href = getHREF($, item);
          }
        });
        return href;
      } catch (error) {
        console.error(error);
        return undefined;
      }
    })
    .catch((error) => {
      console.error(error);
      return undefined;
    });
}

function getHREF($: Cheerio & Root, item: Element) {
  try {
    return $(item).find('a[href^="https"]').attr("href")?.trim();
  } catch (error) {
    return undefined;
  }
}

function getImage(repo: string) {
  return aimer(repo)
    .then(($) => {
      try {
        const site = $("meta");
        if (!site || site.length === 0) return [];

        let href;
        site.each((index, item) => {
          const attr = $(item).attr("property");
          if (attr == "og:image") {
            href = getSRC($, item);
          }
        });
        return href;
      } catch (error) {
        console.error(error);
        return undefined;
      }
    })
    .catch((error) => {
      console.error(error);
      return undefined;
    });
}

function getSRC($: Cheerio & Root, item: Element) {
  try {
    return $(item).attr("content")?.trim();
  } catch (error) {
    return undefined;
  }
}

function getStars($: Cheerio & Root, item: Element) {
  try {
    return $(item).find('a[href$="/stargazers"]').text().trim();
  } catch (error) {
    return 0;
  }
}

function getForks($: Cheerio & Root, item: Element) {
  try {
    return $(item).find('a[href$="/network/members"]').text().trim();
  } catch (error) {
    return 0;
  }
}

function getLanguage($: Cheerio & Root, item: Element) {
  try {
    return $(item).find('[itemprop="programmingLanguage"]').text();
  } catch (error) {
    return undefined;
  }
}

function getLanguageColor($: Cheerio & Root, item: Element) {
  try {
    return $(item).find(".repo-language-color").css("background-color");
  } catch (error) {
    return undefined;
  }
}

async function handler(request: Request): Promise<Response> {
  /* allow cors from any origin */
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Request-Method": "*",
    "Access-Control-Allow-Methods": "OPTIONS, GET",
    "Access-Control-Allow-Headers": "*",
  };

  if (request.method === "OPTIONS") {
    return new Response();
  }

  const url = new URL(request.url);
  const { username, refresh } = Object.fromEntries(url.searchParams);

  if (!username) {
    headers["content-type"] = "text/html";

    return new Response(
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
  `,
      { headers }
    );
  }

  let result;
  const cachedResult = cache.get(username);
  if (cachedResult && !refresh) {
    result = cachedResult;
    // stale-while-revalidate
    ghPinnedRepos(username)
      .then((data) => {
        cache.set(username, data);
      })
      .catch((error) => {});
  } else {
    result = await ghPinnedRepos(username);
    cache.set(username, result);
  }
  headers["content-type"] = "application/json";
  return new Response(JSON.stringify(result), { headers });
}

serve(handler);
console.log(`> Open http://localhost:8000`);
