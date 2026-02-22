const axios = require('axios');

const ANILIST_API = 'https://graphql.anilist.co';

const cache = new Map();

class AniListHelper {
  async query(query, variables = {}) {
    const cacheKey = `anilist:${JSON.stringify(variables)}`;
    
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < 300000) {
        console.log('using the cache data');
        return cached.data;
      }
    }

    try {
      const response = await axios.post(ANILIST_API, {
        query,
        variables
      });

      if (response.data.errors) {
        console.error('AniList errors:', response.data.errors);
        return null;
      }

      cache.set(cacheKey, {
        data: response.data.data,
        timestamp: Date.now()
      });

      return response.data.data;
    } catch (error) {
      console.error('AniList API error:', error.message);
      return null;
    }
  }

  async getTrending(page = 1) {
    const query = `
      query ($page: Int) {
        Page(page: $page, perPage: 20) {
          pageInfo {
            hasNextPage
            currentPage
          }
          media(
            type: ANIME, 
            sort: TRENDING_DESC,
            status_in: [RELEASING, FINISHED]
          ) {
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
            trending
            externalLinks {
              site
              url
            }
            idMal
          }
        }
      }
    `;
    
    return this.query(query, { page });
  }

  async getPopular(page = 1) {
    const query = `
      query ($page: Int) {
        Page(page: $page, perPage: 20) {
          pageInfo {
            hasNextPage
            currentPage
          }
          media(
            type: ANIME, 
            sort: POPULARITY_DESC,
            status: FINISHED
          ) {
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
            popularity
            externalLinks {
              site
              url
            }
            idMal
          }
        }
      }
    `;
    
    return this.query(query, { page });
  }

  async getSeasonal(page = 1) {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    
    let season = 'WINTER';
    if (month >= 3 && month <= 5) season = 'SPRING';
    else if (month >= 6 && month <= 8) season = 'SUMMER';
    else if (month >= 9 && month <= 12) season = 'FALL';

    const query = `
      query ($page: Int, $season: MediaSeason, $year: Int) {
        Page(page: $page, perPage: 20) {
          pageInfo {
            hasNextPage
            currentPage
          }
          media(
            type: ANIME,
            season: $season,
            seasonYear: $year,
            sort: POPULARITY_DESC
          ) {
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
            popularity
            externalLinks {
              site
              url
            }
            idMal
          }
        }
      }
    `;
    
    return this.query(query, { page, season, year });
  }

  async getById(id) {
    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          id
          title {
            romaji
            english
            native
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
          nextAiringEpisode {
            airingAt
            episode
          }
          studios(isMain: true) {
            nodes {
              name
            }
          }
          characters(page: 1, perPage: 10) {
            edges {
              node {
                name {
                  full
                }
              }
              role
            }
          }
          externalLinks {
            site
            url
          }
          idMal
          recommendations(page: 1, perPage: 5) {
            edges {
              node {
                mediaRecommendation {
                  id
                  title {
                    romaji
                    english
                  }
                  coverImage {
                    medium
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    return this.query(query, { id });
  }
}

module.exports = new AniListHelper();
