const anilist = require('./anilist');
const idMapper = require('./idMapper');

function toCatalogMeta(anilistMedia) {
  const name = anilistMedia.title.english || anilistMedia.title.romaji;
  
  let rating = null;
  if (anilistMedia.averageScore) {
    rating = (anilistMedia.averageScore / 10).toFixed(1);
  }

  const cleanDescription = anilistMedia.description
    ?.replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .substring(0, 300) + '...';

  return {
    id: `anilist-${anilistMedia.id}`,
    type: anilistMedia.format === 'MOVIE' ? 'movie' : 'series',
    name: name,
    poster: anilistMedia.coverImage?.large || anilistMedia.coverImage?.medium,
    posterShape: 'regular',
    background: anilistMedia.bannerImage,
    description: cleanDescription || 'No description',
    releaseInfo: anilistMedia.seasonYear?.toString(),
    imdbRating: rating,
    genres: anilistMedia.genres || []
  };
}

function toDetailedMeta(anilistMedia, mappings, imdbData, episodeData) {
  const base = toCatalogMeta(anilistMedia);
  
  base.description = imdbData?.plot || 
    anilistMedia.description?.replace(/<[^>]*>/g, '') || 
    'No description available';
  
  if (anilistMedia.characters?.edges) {
    base.cast = anilistMedia.characters.edges.map(edge => 
      `${edge.node.name.full} (${edge.role})`
    );
  }
  
  if (anilistMedia.studios?.nodes) {
    base.production = anilistMedia.studios.nodes.map(s => s.name).join(', ');
  }
  
  base.links = [
    {
      name: 'AniList',
      category: 'Metadata',
      url: `https://anilist.co/anime/${anilistMedia.id}`
    }
  ];
  
  if (mappings?.imdb) {
    base.links.push({
      name: 'IMDb',
      category: 'Metadata',
      url: `https://www.imdb.com/title/${mappings.imdb}`
    });
  }
  
  if (mappings?.mal) {
    base.links.push({
      name: 'MyAnimeList',
      category: 'Metadata',
      url: `https://myanimelist.net/anime/${mappings.mal}`
    });
  }
  
  if (episodeData && episodeData.episodes && anilistMedia.format !== 'MOVIE') {
    base.videos = [];
    
    const episodes = episodeData.episodes;
    
    for (const [epKey, epInfo] of Object.entries(episodes)) {
      const epNumber = parseInt(epKey);
      if (isNaN(epNumber)) continue;
      
      let title = `Episode ${epNumber}`;
      if (epInfo.title) {
        if (typeof epInfo.title === 'object') {
          title = epInfo.title.en || epInfo.title['x-jat'] || epInfo.title.ja || `Episode ${epNumber}`;
        } else if (typeof epInfo.title === 'string') {
          title = epInfo.title;
        }
      }
      
      let released = null;
      if (epInfo.airDateUtc) {
        released = epInfo.airDateUtc;
      } else if (epInfo.airDate) {
        try {
          const date = new Date(epInfo.airDate);
          if (!isNaN(date.getTime())) {
            released = date.toISOString();
          }
        } catch (e) {
          console.log('Date parsing error:', e.message);
        }
      } else if (epInfo.airdate) {
        try {
          const date = new Date(epInfo.airdate);
          if (!isNaN(date.getTime())) {
            released = date.toISOString();
          }
        } catch (e) {
          console.log('Date parsing error:', e.message);
        }
      }
      
      const overview = epInfo.overview || epInfo.summary || `Episode ${epNumber}`;
      
      const thumbnail = epInfo.image || epInfo.thumbnail || anilistMedia.coverImage?.medium;
      
      const season = epInfo.seasonNumber || 1;
      
      base.videos.push({
        id: `anilist-${anilistMedia.id}:${season}:${epNumber}`,
        title: title,
        season: season,
        episode: epNumber,
        released: released,
        overview: overview,
        thumbnail: thumbnail,
        available: true
      });
    }
    
    if (base.videos.length > 0) {
      base.videos.sort((a, b) => {
        if (a.season !== b.season) return a.season - b.season;
        return a.episode - b.episode;
      });
      
      console.log(`Created ${base.videos.length} video objects`);
    }
  }
  
  return base;
}

function toCatalogResponse(anilistPageData) {
  if (!anilistPageData || !anilistPageData.Page) {
    return { metas: [] };
  }

  return {
    metas: anilistPageData.Page.media.map(media => toCatalogMeta(media)),
    nextCursor: anilistPageData.Page.pageInfo?.hasNextPage ? 
                (anilistPageData.Page.pageInfo.currentPage + 1).toString() : 
                undefined
  };
}

function streamsFromAnimePahe(sources, animepaheId) {
  if (!sources || !sources.sources || sources.sources.length === 0) {
    return { streams: [] };
  }

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

  return { streams };
}

module.exports = {
  toCatalogMeta,
  toDetailedMeta,
  toCatalogResponse,
  streamsFromAnimePahe
};
