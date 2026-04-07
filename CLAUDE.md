# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

等距離リング on メルカトル (Distance Ring on Mercator) - A PHP web application that draws equidistance lines on a Mercator projection world map. Given a center point and distance, it computes points on a geodesic circle using the WGS84 ellipsoid and renders them on an SVG map.

## Architecture

- `index.php` - Entry point; parses URL query parameters, outputs HTML with embedded initial state JSON
- `assets/app.js` - All client-side logic in a single IIFE (vanilla JS, no frameworks)
- `assets/styles.css` - CSS styling with CSS custom properties
- `data/world-countries.geojson` - World map geometry from Natural Earth (public domain)

## Development

No build step required. Deploy by copying files to a PHP-enabled web server. Open `index.php` in a browser.

For local development, use PHP's built-in server:
```bash
php -S localhost:8000
```

## Key Technical Details

- **Geodesy**: Uses Vincenty's direct formula on WGS84 ellipsoid for accurate distance calculations. Falls back to spherical approximation when iterations fail to converge (near antipodal points).
- **Projection**: Web Mercator with latitude clamped to ±85.05112878°
- **Map wrapping**: The SVG renders three copies of the world map (offsets -360, 0, 360) to handle horizon crossing smoothly
- **URL state**: All view parameters (lat, lon, km, color, lineWidth, mapLat, mapLon, zoom) are stored in URL query params and synced via `history.replaceState`

## Export Formats

The app exports to SVG, EPS, PNG, and GeoJSON. The EPS export is designed for print/media workflows.
