const axios = require('axios');

class IDMapper {
  constructor() {
    this.cache = new Map();
    this.MAPPING_API = 'https://api.ani.zip/mappings?anilist_id=';
    this.IMDB_MIRROR_API = 'https://api.imdbapi.dev';
    
    const { ANIME } = require('@consumet/extensions');
    this.animepahe = new ANIME.AnimePahe();
  }

  async getIdsFromAnilist(anilistId) {
    const cacheKey = `mapping:anilist:${anilistId}`;
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < 86400000) {
        return cached.data;
      }
    }

    try {
      const response = await axios.get(
        `${this.MAPPING_API}${anilistId}`
      );

      console.log('Got mappings from ani.zip:', response.data);
      
      const mappings = {
        anilist: anilistId,
        mal: response.data?.mal_id || null,
        anidb: response.data?.anidb_id || null,
        kitsu: response.data?.kitsu_id || null,
        imdb: response.data?.imdb_id || null,
        tvdb: response.data?.thetvdb_id || null,
        tmdb: response.data?.themoviedb_id || null,
        type: response.data?.type || null,
        episodeMapping: response.data?.episodes || null
      };

      this.cache.set(cacheKey, {
        data: mappings,
        timestamp: Date.now()
      });

      return mappings;
    } catch (error) {
      console.log('Mapping API error:', error.message);
      return { anilist: anilistId };
    }
  }

  async getImdbMirrorData(imdbId) {
    if (!imdbId) return null;
    
    const cacheKey = `imdb:mirror:${imdbId}`;
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < 86400000) {
        return cached.data;
      }
    }

    try {
      const response = await axios.get(
        `${this.IMDB_MIRROR_API}/titles/${imdbId}`
      );

      console.log('Got IMDb data');
      
      this.cache.set(cacheKey, {
        data: response.data,
        timestamp: Date.now()
      });

      return response.data;
    } catch (error) {
      console.error('IMDB API error:', error.message);
      return null;
    }
  }

  async getAnimePaheId(anilistId) {
    const cacheKey = `animepahe:id:${anilistId}`;
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < 86400000) {
        return cached.data;
      }
    }

    try {
      const anilistTitles = await this.getAniListTitles(anilistId);
      if (!anilistTitles.romaji && !anilistTitles.english) return null;

      const searchTitle = anilistTitles.romaji || anilistTitles.english;
      const results = await this.searchAnimePahe(searchTitle);
      
      if (!results || results.length === 0) return null;

      const match = await this.findBestAnimePaheMatch(anilistTitles, results);
      if (match) {
        console.log(`Found AnimePahe ID: ${match.id} for "${match.title}"`);
        this.cache.set(cacheKey, {
          data: match.id,
          timestamp: Date.now()
        });
        return match.id;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting AnimePahe ID:', error.message);
      return null;
    }
  }

  async getEpisodeMapping(anilistId) {
    try {
      const response = await axios.get(`https://api.ani.zip/mappings?anilist_id=${anilistId}`);
      return response.data?.episodes || null;
    } catch (error) {
      console.log('Failed to fetch episode mapping:', error.message);
      return null;
    }
  }

  async getAnimePaheEpisodeInfo(animepaheId, anilistId, requestedEpisode) {
    const cacheKey = `animepahe:episodeInfo:${animepaheId}:${requestedEpisode}`;
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < 86400000) {
        return cached.data;
      }
    }

    try {
      console.log(`Fetching episode list for ${animepaheId}`);
      
      const episodeList = await this.animepahe.fetchAnimeInfo(animepaheId);
      
      if (!episodeList || !episodeList.episodes) {
        console.log('No episodes found');
        return null;
      }

      console.log(`Found ${episodeList.episodes.length} total episodes on AnimePahe`);
      console.log('AnimePahe episode numbers:', episodeList.episodes.map(e => e.number).join(', '));
      
      const episodeMapping = await this.getEpisodeMapping(anilistId);
      
      if (episodeMapping) {
        console.log('ani.zip episode mapping available');
        
        if (episodeMapping[requestedEpisode]) {
          console.log(`ani.zip has data for episode ${requestedEpisode}`);
          
          const aniZipEpisode = episodeMapping[requestedEpisode];
          let targetEpisode = null;
          
          if (aniZipEpisode.title) {
            const aniZipTitle = typeof aniZipEpisode.title === 'object' 
              ? aniZipEpisode.title.en || aniZipEpisode.title['x-jat'] 
              : aniZipEpisode.title;
              
            if (aniZipTitle) {
              targetEpisode = episodeList.episodes.find(ep => 
                ep.title?.toLowerCase().includes(aniZipTitle.toLowerCase()) ||
                aniZipTitle.toLowerCase().includes(ep.title?.toLowerCase() || '')
              );
            }
          }
          
          if (!targetEpisode && episodeList.episodes.length > 0) {
            const sortedAnimePaheEpisodes = [...episodeList.episodes].sort((a, b) => a.number - b.number);
            const sortedAniZipEpisodes = Object.keys(episodeMapping).map(Number).sort((a, b) => a - b);
            
            if (sortedAnimePaheEpisodes.length === sortedAniZipEpisodes.length) {
              const index = sortedAniZipEpisodes.indexOf(requestedEpisode);
              if (index !== -1 && index < sortedAnimePaheEpisodes.length) {
                console.log(`Mapping by position: ani.zip episode ${requestedEpisode} (index ${index}) -> AnimePahe episode ${sortedAnimePaheEpisodes[index].number}`);
                targetEpisode = sortedAnimePaheEpisodes[index];
              }
            } else {
              const firstAnimePaheEpisode = sortedAnimePaheEpisodes[0].number;
              const firstAniZipEpisode = sortedAniZipEpisodes[0];
              const offset = firstAnimePaheEpisode - firstAniZipEpisode;
              
              const expectedNumber = requestedEpisode + offset;
              console.log(`Trying offset match: episode ${requestedEpisode} + ${offset} = ${expectedNumber} on AnimePahe`);
              
              targetEpisode = episodeList.episodes.find(ep => ep.number === expectedNumber);
            }
          }
          
          if (targetEpisode) {
            console.log(`Found matching episode: AnimePahe episode ${targetEpisode.number} for ani.zip episode ${requestedEpisode}`);
            this.cache.set(cacheKey, {
              data: targetEpisode,
              timestamp: Date.now()
            });
            return targetEpisode;
          }
        }
      }
      
      console.log('No mapping found, trying fallback strategies...');
      
      let targetEpisode = episodeList.episodes.find(ep => ep.number === requestedEpisode);
      
      if (!targetEpisode && requestedEpisode === 1) {
        console.log('Episode 1 not found, checking if episodes start at 0...');
        targetEpisode = episodeList.episodes.find(ep => ep.number === 0);
      }
      
      if (!targetEpisode && requestedEpisode === 1 && episodeList.episodes.length > 0) {
        const sortedEpisodes = [...episodeList.episodes].sort((a, b) => a.number - b.number);
        if (sortedEpisodes[0].number > 1) {
          console.log(`First episode is ${sortedEpisodes[0].number}, using it for episode 1`);
          targetEpisode = sortedEpisodes[0];
        }
      }
      
      if (!targetEpisode) {
        console.log(`Could not find matching episode for requested episode ${requestedEpisode}`);
        console.log('Available episodes:', episodeList.episodes.map(e => e.number).join(', '));
        return null;
      }

      console.log(`Found episode ${targetEpisode.number} via fallback for request ${requestedEpisode}`);
      
      this.cache.set(cacheKey, {
        data: targetEpisode,
        timestamp: Date.now()
      });

      return targetEpisode;
    } catch (error) {
      console.error('Error fetching episode info:', error.message);
      return null;
    }
  }

  async getAnimePaheSources(animepaheId, anilistId, episodeNumber) {
    const cacheKey = `animepahe:sources:${animepaheId}:${episodeNumber}`;
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < 1800000) {
        return cached.data;
      }
    }

    try {
      console.log(`\nProcessing episode ${episodeNumber} for AniList ID: ${anilistId}`);
      const episodeInfo = await this.getAnimePaheEpisodeInfo(animepaheId, anilistId, episodeNumber);
      
      if (!episodeInfo || !episodeInfo.id) {
        console.log('Could not get episode info');
        return null;
      }
      
      console.log(`Fetching sources for episode ID: ${episodeInfo.id}`);
      const sources = await this.animepahe.fetchEpisodeSources(episodeInfo.id);
      
      if (sources) {
        console.log(`Got sources: ${sources.sources?.length || 0} video sources, ${sources.download?.length || 0} download links`);
      }
      
      this.cache.set(cacheKey, {
        data: sources,
        timestamp: Date.now()
      });

      return sources;
    } catch (error) {
      console.error('Error fetching AnimePahe sources:', error.message);
      return null;
    }
  }

  async getAnimePaheDirect(animepaheId, anilistId, episodeNumber) {
    return this.getAnimePaheSources(animepaheId, anilistId, episodeNumber);
  }

  async getAniListTitles(anilistId) {
    const cacheKey = `titles:anilist:${anilistId}`;
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < 86400000) {
        return cached.data;
      }
    }

    const query = `
      query ($id: Int) {
        Media(id: $id) {
          title {
            romaji
            english
            native
          }
        }
      }
    `;

    try {
      const response = await axios.post('https://graphql.anilist.co', {
        query,
        variables: { id: anilistId }
      }, {
        headers: { 'Content-Type': 'application/json' }
      });

      const media = response.data?.data?.Media;
      if (!media) {
        return { english: null, romaji: null, native: null };
      }

      const titles = {
        english: media.title?.english || null,
        romaji: media.title?.romaji || null,
        native: media.title?.native || null
      };

      this.cache.set(cacheKey, {
        data: titles,
        timestamp: Date.now()
      });

      return titles;
    } catch (error) {
      console.error('Error fetching AniList titles:', error.message);
      return { english: null, romaji: null, native: null };
    }
  }

  async searchAnimePahe(title) {
    if (!title || title.trim() === '') return [];
    
    const cacheKey = `animepahe:search:${title}`;
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < 3600000) {
        return cached.data;
      }
    }

    try {
      console.log(`Searching AnimePahe for: "${title}"`);
      const results = await this.animepahe.search(title);
      
      let resultsArray = [];
      if (results && typeof results === 'object') {
        if (Array.isArray(results)) {
          resultsArray = results;
        } else if (results.results && Array.isArray(results.results)) {
          resultsArray = results.results;
        } else {
          resultsArray = [results];
        }
      }
      
      console.log(`Found ${resultsArray.length} results`);
      
      this.cache.set(cacheKey, {
        data: resultsArray,
        timestamp: Date.now()
      });

      return resultsArray;
    } catch (error) {
      console.error(`Search failed:`, error.message);
      return [];
    }
  }

  normalizeTitle(title) {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  isTitleSimilar(title1, title2) {
    const norm1 = this.normalizeTitle(title1);
    const norm2 = this.normalizeTitle(title2);
    
    if (norm1 === norm2) return true;
    if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
    
    const words1 = norm1.split(' ');
    const words2 = norm2.split(' ');
    
    const commonWords = words1.filter(word => 
      word.length > 2 && words2.includes(word)
    );
    
    const significantWords1 = words1.filter(w => w.length > 2);
    const significantWords2 = words2.filter(w => w.length > 2);
    
    if (significantWords1.length > 0 && significantWords2.length > 0) {
      const matchRatio = commonWords.length / Math.max(significantWords1.length, significantWords2.length);
      return matchRatio > 0.5;
    }
    
    return false;
  }

  async findBestAnimePaheMatch(anilistTitles, animePaheResults) {
    if (!animePaheResults || animePaheResults.length === 0) return null;
    
    const titlesToTry = [
      anilistTitles.romaji,
      anilistTitles.english,
      anilistTitles.native
    ].filter(Boolean);
    
    for (const anilistTitle of titlesToTry) {
      for (const animePaheResult of animePaheResults) {
        if (animePaheResult && animePaheResult.title && this.isTitleSimilar(anilistTitle, animePaheResult.title)) {
          console.log(`Matched "${anilistTitle}" to "${animePaheResult.title}"`);
          return animePaheResult;
        }
      }
    }
    
    return null;
  }
}

module.exports = new IDMapper();
