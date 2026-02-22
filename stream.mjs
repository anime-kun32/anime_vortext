import { ANIME } from '@consumet/extensions';

const animepahe = new ANIME.AnimePahe();

animepahe
  .fetchEpisodeSources("e22befc5-cd73-1974-b171-fbf04180cd61/2e9580a5e43e98a5645de5e4a450e7f93c3618bedf4cd72dbeb4fc3aeda8f110")
  .then(data => {
    console.log(JSON.stringify(data, null, 2));
  })
  .catch(err => console.error(err));