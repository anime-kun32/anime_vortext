# Anime Vortex - Stremio Addon

A Stremio addon that provides trending and popular anime catalogs with streaming links from AnimePahe.

## Features

- Trending anime catalog
- Popular anime catalog (all-time & seasonal)
- Anime search functionality
- Anime movies search
- Episode metadata from ani.zip
- Streaming sources from AnimePahe

## Installation

1. Clone the repository:
git clone https://github.com/anime-kun32/anime_vortext.git

2. Navigate to the project directory:
cd anime_vortext

3. Install dependencies:
npm install

4. Start the addon:
npm start

The addon will be running at http://localhost:7000

## Usage in Stremio

1. Make sure the addon is running
2. Open Stremio
3. Go to Addons → Community Addons
4. Enter the addon URL: http://localhost:7000/manifest.json
5. Click Install

## Development

For development with auto-restart on file changes:
npm run dev

## API Credits

- AniList - Anime metadata
- ani.zip - Episode mappings
- AnimePahe - Video sources
- Consumet - Anime scraping
