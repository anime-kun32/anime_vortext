const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const anilist = require('./helpers/anilist.js');
const idMapper = require('./helpers/idMapper.js');
const { toCatalogResponse, toDetailedMeta, streamsFromAnimePahe, toCatalogMeta } = require('./helpers/transformer.js');
const axios = require('axios');

const manifest = {
  id: 'community.anime-vortex',
  version: '1.0.0',
  name: 'Anime Vortex',
  description: 'Rip through the best anime with trending & popular catalogs',
  resources: ['catalog', 'meta', 'stream'],
  types: ['series', 'movie'],
  catalogs: [
    {
      type: 'series',
      id: 'anime-trending',
      name: 'Trending Anime',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'anime-popular',
      name: 'Popular Anime',
      extra: [
        { name: 'skip', isRequired: false },
        { name: 'genre', isRequired: false, options: ['all-time', 'seasonal'] }
      ]
    },
    {
      type: 'series',
      id: 'anime-search',
      name: 'Anime Search',
      extra: [
        { name: 'search', isRequired: true },
        { name: 'skip', isRequired: false }
      ]
    },
    {
      type: 'movie',
      id: 'movie-search',
      name: 'Anime Movies Search',
      extra: [
        { name: 'search', isRequired: true },
        { name: 'skip', isRequired: false }
      ]
    }
  ],
  idPrefixes: ['anilist-']
};

const builder = new addonBuilder(manifest);

async function searchAnime(query, page = 1, type = 'ANIME') {
  const searchQuery = `
    query ($page: Int, $search: String, $type: MediaType) {
      Page(page: $page, perPage: 20) {
        pageInfo {
          hasNextPage
          currentPage
        }
        media(type: $type, search: $search, sort: POPULARITY_DESC) {
          id
          title {
            romaji
            english
          }
          coverImage {
            large
            medium
          }
          bannerImage
          description
          episodes
          format
          genres
          averageScore
          seasonYear
          status
          popularity
        }
      }
    }
  `;
  
  return anilist.query(searchQuery, { page, search: query, type });
}

builder.defineCatalogHandler(async (args) => {
  console.log('Catalog Request:', args.id, args.extra);

  try {
    const page = parseInt(args.extra?.skip) || 1;
    let data;

    if (args.extra && args.extra.search) {
      console.log(`SEARCH REQUEST: "${args.extra.search}" for ${args.type}`);
      
      let searchType = 'ANIME';
      if (args.id === 'movie-search') {
        searchType = 'ANIME';
      }
      
      data = await searchAnime(args.extra.search, page, searchType);
      
      if (!data || !data.Page) {
        return { metas: [] };
      }
      
      let mediaList = data.Page.media;
      if (args.id === 'movie-search') {
        mediaList = mediaList.filter(m => m.format === 'MOVIE');
      } else if (args.id === 'anime-search') {
        mediaList = mediaList.filter(m => m.format !== 'MOVIE');
      }
      
      const response = {
        metas: mediaList.map(media => toCatalogMeta(media)),
        nextCursor: data.Page.pageInfo?.hasNextPage ? 
                    (data.Page.pageInfo.currentPage + 1).toString() : 
                    undefined
      };
      
      console.log(`Returning ${response.metas.length} search results`);
      return response;
    }

    switch (args.id) {
      case 'anime-trending':
        data = await anilist.getTrending(page);
        break;
      case 'anime-popular':
        if (args.extra?.genre === 'seasonal') {
          data = await anilist.getSeasonal(page);
        } else {
          data = await anilist.getPopular(page);
        }
        break;
      case 'anime-search':
        data = await anilist.getPopular(page);
        if (data && data.Page) {
          data.Page.media = data.Page.media.filter(m => m.format !== 'MOVIE');
        }
        break;
      case 'movie-search':
        data = await anilist.getPopular(page);
        if (data && data.Page) {
          data.Page.media = data.Page.media.filter(m => m.format === 'MOVIE');
        }
        break;
      default:
        return { metas: [] };
    }

    if (!data) return { metas: [] };
    
    const response = toCatalogResponse(data);
    console.log(`Returning ${response.metas.length} catalog items`);
    
    return response;
  } catch (error) {
    console.error('Catalog error:', error);
    return { metas: [] };
  }
});

builder.defineMetaHandler(async (args) => {
  try {
    const anilistId = args.id.replace('anilist-', '').split(':')[0];
    console.log('Fetching meta for ID:', anilistId);

    const anilistData = await anilist.getById(parseInt(anilistId));
    if (!anilistData || !anilistData.Media) {
      console.log('No AniList data found');
      return { meta: null };
    }

    const media = anilistData.Media;
    
    const mappings = await idMapper.getIdsFromAnilist(parseInt(anilistId));

    let imdbData = null;
    if (mappings?.imdb) {
      imdbData = await idMapper.getImdbMirrorData(mappings.imdb);
    }

    let episodeData = null;
    try {
      console.log(`Fetching episode data from ani.zip for ID: ${anilistId}`);
      const response = await axios.get(`https://api.ani.zip/mappings?anilist_id=${anilistId}`);
      episodeData = response.data;
      
      const episodeCount = Object.keys(episodeData.episodes || {}).length;
      console.log(`Found ${episodeCount} episodes in ani.zip data`);
    } catch (error) {
      console.log('Episode fetch failed:', error.message);
    }

    const meta = toDetailedMeta(media, mappings, imdbData, episodeData);
    
    console.log(`Returning meta for "${meta.name}" with ${meta.videos?.length || 0} videos`);
    
    return { meta };
  } catch (error) {
    console.error('Meta error:', error);
    return { meta: null };
  }
});

builder.defineStreamHandler(async (args) => {
  try {
    const idParts = args.id.split('-');
    if (idParts.length < 2) {
      console.log('Invalid ID format:', args.id);
      return { streams: [] };
    }
    
    const restParts = idParts[1].split(':');
    const anilistId = restParts[0];
    const seasonNum = restParts.length > 1 ? parseInt(restParts[1]) : 1;
    const episodeNum = restParts.length > 2 ? parseInt(restParts[2]) : 1;

    console.log(`\n Stream request - AniList: ${anilistId}, Season: ${seasonNum}, Episode: ${episodeNum}`);

    console.log('Step 1: Getting AnimePahe ID...');
    const animepaheId = await idMapper.getAnimePaheId(parseInt(anilistId));
    if (!animepaheId) {
      console.log('No AnimePahe ID found');
      return { streams: [] };
    }
    console.log(`AnimePahe ID: ${animepaheId}`);

    console.log('Step 2: Fetching stream sources...');
    
    const sources = await idMapper.getAnimePaheSources(animepaheId, parseInt(anilistId), episodeNum);
    
    if (!sources || !sources.sources || sources.sources.length === 0) {
      console.log('No sources found');
      return { streams: [] };
    }

    console.log(`Found ${sources.sources.length} sources`);
    
    const streams = sources.sources.map(source => ({
      name: 'AnimePahe',
      title: source.quality ? `${source.quality}p` : 'Auto',
      url: source.url,
      behaviorHints: {
        notWebReady: false,
        bingeGroup: `animepahe-${animepaheId}`
      }
    }));

    if (sources.download && sources.download.length > 0) {
      sources.download.forEach(download => {
        streams.push({
          name: 'AnimePahe Download',
          title: download.quality ? `${download.quality}p` : 'Download',
          url: download.url,
          behaviorHints: {
            notWebReady: true,
            bingeGroup: `animepahe-${animepaheId}`
          }
        });
      });
    }
    
    console.log(`Returning ${streams.length} streams`);
    
    return { streams };
  } catch (error) {
    console.error('Stream error:', error);
    return { streams: [] };
  }
});

const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });

console.log(`
ANIME VORTEX - RIP THROUGH THE BEST ANIME
----------------------------------------
Server is running at http://localhost:${port}
`);
