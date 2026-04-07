const WORLD_WIDTH = 360;
const WORLD_HEIGHT = 360;
const MERCATOR_MAX_LAT = 85.05112878;
const MAX_ZOOM = 48;
const DEFAULT_LAT = 35.6762;
const DEFAULT_LON = 139.6503;
const DEFAULT_DISTANCES = [1000, 2000];
const DEFAULT_COLOR = '#d03a30';
const DEFAULT_LINE_WIDTH = 2.5;
const DEFAULT_LABEL = '中心地';
const DEFAULT_MAP_CENTER_LAT = 20;
const DEFAULT_MAP_CENTER_LON = 140;
const EXPORT_SCALE = 2;

const WGS84 = {
  a: 6378137,
  b: 6356752.314245,
  f: 1 / 298.257223563,
  meanRadius: 6371008.8,
};

export function mountMercatorRadiusTool(root) {
  if (!(root instanceof HTMLElement)) {
    throw new Error('Mount root is required.');
  }

  const abortController = new AbortController();
  const initialState = getInitialStateFromLocation(window.location.search);

  const els = {
    map: queryRequired(root, '#map'),
    mapWrap: queryRequired(root, '#mapWrap'),
    latInput: queryRequired(root, '#latInput'),
    lonInput: queryRequired(root, '#lonInput'),
    distancesList: queryRequired(root, '#distancesList'),
    addRingBtn: queryRequired(root, '#addRingBtn'),
    colorInput: queryRequired(root, '#colorInput'),
    lineWidthInput: queryRequired(root, '#lineWidthInput'),
    labelInput: queryRequired(root, '#labelInput'),
    fitBtn: queryRequired(root, '#fitBtn'),
    worldBtn: queryRequired(root, '#worldBtn'),
    zoomInBtn: queryRequired(root, '#zoomInBtn'),
    zoomOutBtn: queryRequired(root, '#zoomOutBtn'),
    downloadSvgBtn: queryRequired(root, '#downloadSvgBtn'),
    downloadEpsBtn: queryRequired(root, '#downloadEpsBtn'),
    downloadPngBtn: queryRequired(root, '#downloadPngBtn'),
    copyPngBtn: queryRequired(root, '#copyPngBtn'),
    downloadGeoJsonBtn: queryRequired(root, '#downloadGeoJsonBtn'),
    copyUrlBtn: queryRequired(root, '#copyUrlBtn'),
    status: queryRequired(root, '#status'),
    cursorCoords: queryRequired(root, '#cursorCoords'),
    selectionCoords: queryRequired(root, '#selectionCoords'),
    ringMeta: queryRequired(root, '#ringMeta'),
  };

  const svgNs = 'http://www.w3.org/2000/svg';
  const xlinkNs = 'http://www.w3.org/1999/xlink';

  const state = {
    zoom: finiteNumber(initialState.zoom, 1),
    centerX: lonToX(finiteNumber(initialState.mapLon, DEFAULT_MAP_CENTER_LON)),
    centerY: latToY(finiteNumber(initialState.mapLat, DEFAULT_MAP_CENTER_LAT)),
    selectedLat: clamp(finiteNumber(initialState.lat, DEFAULT_LAT), -90, 90),
    selectedLon: normalizeLon(finiteNumber(initialState.lon, DEFAULT_LON)),
    distances: normalizeDistances(initialState.distances || DEFAULT_DISTANCES),
    ringColor: normalizeHexColor(initialState.color, DEFAULT_COLOR),
    lineWidth: clamp(finiteNumber(initialState.lineWidth, DEFAULT_LINE_WIDTH), 0.5, 12),
    label: initialState.label ?? DEFAULT_LABEL,
    mapReady: false,
    ringsData: [],
    currentViewBox: { x: 0, y: 0, width: 360, height: 180 },
    dragging: {
      active: false,
      moved: false,
      pointerId: null,
      startClientX: 0,
      startClientY: 0,
      startCenterX: 0,
      startCenterY: 0,
      startViewWidth: 0,
      startViewHeight: 0,
    },
  };

  const defs = createSvgElement('defs');
  const mapGeometry = createSvgElement('g');
  mapGeometry.setAttribute('id', 'mapGeometry');
  const ringGeometry = createSvgElement('g');
  ringGeometry.setAttribute('id', 'ringGeometry');
  const markerGeometry = createSvgElement('g');
  markerGeometry.setAttribute('id', 'markerGeometry');
  const markerCross = createSvgElement('path');
  markerCross.setAttribute('fill', 'none');
  markerCross.setAttribute('stroke', '#1f2933');
  markerCross.setAttribute('stroke-width', '1.5');
  markerCross.setAttribute('stroke-linecap', 'round');
  markerCross.setAttribute('vector-effect', 'non-scaling-stroke');
  const markerDot = createSvgElement('circle');
  markerDot.setAttribute('r', '2.4');
  markerDot.setAttribute('fill', '#ffffff');
  markerDot.setAttribute('stroke', '#1f2933');
  markerDot.setAttribute('stroke-width', '1.4');
  markerDot.setAttribute('vector-effect', 'non-scaling-stroke');
  const markerLabel = createSvgElement('text');
  markerLabel.setAttribute('text-anchor', 'middle');
  markerLabel.setAttribute('fill', '#1f2933');
  markerLabel.setAttribute('stroke', '#ffffff');
  markerLabel.setAttribute('stroke-width', '2');
  markerLabel.setAttribute('stroke-linejoin', 'round');
  markerLabel.setAttribute('paint-order', 'stroke');
  markerLabel.setAttribute('font-size', '5');
  markerLabel.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
  markerLabel.setAttribute('font-weight', '700');
  markerLabel.setAttribute('dy', '10');
  markerGeometry.appendChild(markerCross);
  markerGeometry.appendChild(markerDot);
  markerGeometry.appendChild(markerLabel);
  defs.appendChild(mapGeometry);
  defs.appendChild(ringGeometry);
  defs.appendChild(markerGeometry);
  els.map.appendChild(defs);

  const oceanRect = createSvgElement('rect');
  oceanRect.setAttribute('x', '-720');
  oceanRect.setAttribute('y', '-20');
  oceanRect.setAttribute('width', '2160');
  oceanRect.setAttribute('height', '400');
  oceanRect.setAttribute('fill', '#eef2f5');
  els.map.appendChild(oceanRect);

  const mapCopies = createCopyGroup('mapGeometry');
  const ringCopies = createCopyGroup('ringGeometry');
  const markerCopies = createCopyGroup('markerGeometry');
  els.map.appendChild(mapCopies);
  els.map.appendChild(ringCopies);
  els.map.appendChild(markerCopies);

  const ringLabelsOverlay = createSvgElement('g');
  ringLabelsOverlay.setAttribute('id', 'ringLabelsOverlay');
  els.map.appendChild(ringLabelsOverlay);

  const borderRect = createSvgElement('rect');
  borderRect.setAttribute('x', '0');
  borderRect.setAttribute('y', '0');
  borderRect.setAttribute('width', String(WORLD_WIDTH));
  borderRect.setAttribute('height', String(WORLD_HEIGHT));
  borderRect.setAttribute('fill', 'none');
  borderRect.setAttribute('stroke', '#c9d2da');
  borderRect.setAttribute('stroke-width', '0.8');
  borderRect.setAttribute('vector-effect', 'non-scaling-stroke');
  mapGeometry.appendChild(borderRect);

  let resizeTimer = null;
  let autoBuildTimer = null;
  let destroyed = false;

  init().catch(handleInitError);

  return () => {
    destroyed = true;
    window.clearTimeout(resizeTimer);
    window.clearTimeout(autoBuildTimer);
    abortController.abort();
  };

  async function init() {
    bindUi();
    renderDistancesList();
    setInputsFromState();
    setStatus('地図データを読み込んでいます…');
    const geojson = await loadWorldGeoJson();
    if (destroyed) {
      return;
    }
    buildBaseMap(geojson);
    state.mapReady = true;
    await nextAnimationFrame();
    ensureZoomWithinBounds();
    buildRings(true);
    render();
    setStatus('準備できました。地図をクリックすると中心点が切り替わります。');
  }

  function handleInitError(error) {
    console.error(error);
    if (destroyed) {
      return;
    }
    const detail = error && error.message ? ` ${error.message}` : '';
    setStatus(`初期化に失敗しました。${detail}`.trim(), 'error');
  }

  async function loadWorldGeoJson() {
    if (typeof window.fetch !== 'function') {
      throw new Error('地図データを取得できません。ブラウザが fetch に対応していません。');
    }
    const response = await fetch('/data/world-countries.geojson', { cache: 'force-cache' });
    if (!response.ok) {
      throw new Error(`地図データの取得に失敗しました。HTTP ${response.status}`);
    }
    const geojson = await response.json();
    return validateWorldGeoJson(geojson);
  }

  function validateWorldGeoJson(geojson) {
    if (!geojson || !Array.isArray(geojson.features)) {
      throw new Error('地図データの形式が不正です。GeoJSON FeatureCollection を確認してください。');
    }
    return geojson;
  }

  function bindUi() {
    addManagedListener(abortController, els.addRingBtn, 'click', () => {
      addDistanceInput();
      buildRings(false);
      updateLocationQuery();
    });

    addManagedListener(abortController, els.fitBtn, 'click', () => {
      if (!state.ringsData.length || !state.ringsData.some(r => r.projectedPoints.length)) {
        setStatus('先に円を描いてください。', 'error');
        return;
      }
      fitToRings();
      render();
      updateLocationQuery();
    });

    addManagedListener(abortController, els.worldBtn, 'click', () => {
      resetView();
      render();
      updateLocationQuery();
    });

    addManagedListener(abortController, els.zoomInBtn, 'click', () => {
      zoomAroundViewportCenter(1.35);
    });

    addManagedListener(abortController, els.zoomOutBtn, 'click', () => {
      zoomAroundViewportCenter(1 / 1.35);
    });

    addManagedListener(abortController, els.downloadSvgBtn, 'click', () => {
      void downloadSvg();
    });

    addManagedListener(abortController, els.downloadEpsBtn, 'click', () => {
      downloadEps();
    });

    addManagedListener(abortController, els.downloadPngBtn, 'click', () => {
      void downloadPng();
    });

    addManagedListener(abortController, els.copyPngBtn, 'click', () => {
      void copyPngToClipboard();
    });

    addManagedListener(abortController, els.downloadGeoJsonBtn, 'click', () => {
      downloadGeoJson();
    });

    addManagedListener(abortController, els.copyUrlBtn, 'click', () => {
      void copyCurrentUrl();
    });

    [els.latInput, els.lonInput].forEach((input) => {
      addManagedListener(abortController, input, 'input', () => {
        scheduleAutoBuildFromInputs();
      });

      addManagedListener(abortController, input, 'change', () => {
        buildRings(false);
      });

      addManagedListener(abortController, input, 'keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          buildRings(false);
        }
      });
    });

    addManagedListener(abortController, els.colorInput, 'input', () => {
      state.ringColor = normalizeHexColor(els.colorInput.value, DEFAULT_COLOR);
      updateRingPathColors();
      updateLocationQuery();
    });

    addManagedListener(abortController, els.lineWidthInput, 'input', () => {
      const lineWidth = clamp(finiteNumber(els.lineWidthInput.value, DEFAULT_LINE_WIDTH), 0.5, 12);
      state.lineWidth = lineWidth;
      updateRingPathWidths();
      updateLocationQuery();
    });

    addManagedListener(abortController, els.labelInput, 'input', () => {
      state.label = (els.labelInput.value || '').trim();
      updateMarker();
      updateLocationQuery();
    });

    addManagedListener(abortController, els.map, 'pointerdown', handlePointerDown);
    addManagedListener(abortController, els.map, 'pointermove', handlePointerMove);
    addManagedListener(abortController, els.map, 'pointerup', handlePointerUp);
    addManagedListener(abortController, els.map, 'pointercancel', cancelDrag);
    addManagedListener(abortController, els.map, 'mouseleave', () => {
      els.cursorCoords.textContent = 'カーソル座標: —';
    });
    addManagedListener(abortController, els.map, 'wheel', handleWheel, { passive: false });

    addManagedListener(abortController, window, 'resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        ensureZoomWithinBounds();
        render();
      }, 80);
    });
  }

  function scheduleAutoBuildFromInputs() {
    window.clearTimeout(autoBuildTimer);
    autoBuildTimer = window.setTimeout(() => {
      buildRings(false, { suppressErrors: true });
    }, 180);
  }

  function handlePointerDown(event) {
    if (!state.mapReady) {
      return;
    }
    const rect = els.map.getBoundingClientRect();
    state.dragging.active = true;
    state.dragging.moved = false;
    state.dragging.pointerId = event.pointerId;
    state.dragging.startClientX = event.clientX;
    state.dragging.startClientY = event.clientY;
    state.dragging.startCenterX = state.centerX;
    state.dragging.startCenterY = state.centerY;
    state.dragging.startViewWidth = state.currentViewBox.width;
    state.dragging.startViewHeight = state.currentViewBox.height;
    if (typeof els.map.setPointerCapture === 'function') {
      els.map.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    if (!rect.width || !rect.height) {
      cancelDrag();
    }
  }

  function handlePointerMove(event) {
    if (!state.mapReady) {
      return;
    }
    const worldPoint = clientToWorld(event.clientX, event.clientY);
    if (worldPoint) {
      const lon = normalizeLon(worldPoint.x - 180);
      const lat = yToLat(worldPoint.y);
      els.cursorCoords.textContent = `カーソル座標: ${formatCoord(lat)}, ${formatCoord(lon)}`;
    }

    if (!state.dragging.active || state.dragging.pointerId !== event.pointerId) {
      return;
    }

    const rect = els.map.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const dxPx = event.clientX - state.dragging.startClientX;
    const dyPx = event.clientY - state.dragging.startClientY;

    if (Math.abs(dxPx) > 3 || Math.abs(dyPx) > 3) {
      state.dragging.moved = true;
    }

    const dxWorld = (dxPx / rect.width) * state.dragging.startViewWidth;
    const dyWorld = (dyPx / rect.height) * state.dragging.startViewHeight;
    state.centerX = normalizeWorldX(state.dragging.startCenterX - dxWorld);
    state.centerY = clampCenterY(state.dragging.startCenterY - dyWorld, state.dragging.startViewHeight);
    render();
  }

  function handlePointerUp(event) {
    if (!state.dragging.active || state.dragging.pointerId !== event.pointerId) {
      return;
    }

    const moved = state.dragging.moved;
    const pointerId = state.dragging.pointerId;
    cancelDrag();
    if (typeof els.map.releasePointerCapture === 'function') {
      try {
        els.map.releasePointerCapture(pointerId);
      } catch (error) {
        // ignore
      }
    }

    if (!moved) {
      const worldPoint = clientToWorld(event.clientX, event.clientY);
      if (!worldPoint) {
        return;
      }
      state.selectedLon = normalizeLon(worldPoint.x - 180);
      state.selectedLat = clamp(yToLat(worldPoint.y), -90, 90);
      setInputsFromState();
      updateMarker();
      buildRings(false);
      render();
      setStatus(`中心点を更新しました。緯度 ${formatCoord(state.selectedLat)}, 経度 ${formatCoord(state.selectedLon)}`);
    } else {
      updateLocationQuery();
    }
  }

  function cancelDrag() {
    state.dragging.active = false;
    state.dragging.moved = false;
    state.dragging.pointerId = null;
  }

  function handleWheel(event) {
    if (!state.mapReady) {
      return;
    }
    event.preventDefault();
    const rect = els.map.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const currentView = state.currentViewBox;
    const anchorX = currentView.x + (px / rect.width) * currentView.width;
    const anchorY = currentView.y + (py / rect.height) * currentView.height;
    const factor = Math.exp(-event.deltaY * 0.0015);
    zoomAroundPoint(anchorX, anchorY, px / rect.width, py / rect.height, factor);
  }

  function zoomAroundViewportCenter(factor) {
    const view = state.currentViewBox;
    zoomAroundPoint(view.x + view.width / 2, view.y + view.height / 2, 0.5, 0.5, factor);
  }

  function zoomAroundPoint(anchorX, anchorY, anchorRatioX, anchorRatioY, factor) {
    const newZoom = clamp(state.zoom * factor, getMinZoom(), MAX_ZOOM);
    if (Math.abs(newZoom - state.zoom) < 1e-9) {
      return;
    }
    const aspect = getAspect();
    const newViewWidth = WORLD_WIDTH / newZoom;
    const newViewHeight = newViewWidth / aspect;
    const newViewX = anchorX - anchorRatioX * newViewWidth;
    const newViewY = anchorY - anchorRatioY * newViewHeight;
    state.zoom = newZoom;
    state.centerX = normalizeWorldX(newViewX + newViewWidth / 2);
    state.centerY = clampCenterY(newViewY + newViewHeight / 2, newViewHeight);
    render();
    updateLocationQuery();
  }

  function buildBaseMap(geojson) {
    buildGraticule();
    const features = Array.isArray(geojson.features) ? geojson.features : [];
    features.forEach((feature) => {
      if (!feature || !feature.geometry) {
        return;
      }
      const d = geometryToPath(feature.geometry);
      if (!d) {
        return;
      }
      const path = createSvgElement('path');
      path.setAttribute('d', d);
      path.setAttribute('fill', '#ffffff');
      path.setAttribute('stroke', '#b8c1c9');
      path.setAttribute('stroke-width', '0.6');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      path.setAttribute('stroke-linejoin', 'round');
      mapGeometry.appendChild(path);
    });
  }

  function buildGraticule() {
    const meridians = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
    const parallels = [-60, -30, 0, 30, 60];

    meridians.forEach((lon) => {
      const line = createSvgElement('line');
      const x = lonToX(lon);
      line.setAttribute('x1', String(x));
      line.setAttribute('x2', String(x));
      line.setAttribute('y1', '0');
      line.setAttribute('y2', String(WORLD_HEIGHT));
      line.setAttribute('stroke', '#dde4ea');
      line.setAttribute('stroke-width', '0.6');
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      mapGeometry.appendChild(line);
    });

    parallels.forEach((lat) => {
      const line = createSvgElement('line');
      const y = latToY(lat);
      line.setAttribute('x1', '0');
      line.setAttribute('x2', String(WORLD_WIDTH));
      line.setAttribute('y1', String(y));
      line.setAttribute('y2', String(y));
      line.setAttribute('stroke', '#dde4ea');
      line.setAttribute('stroke-width', '0.6');
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      mapGeometry.appendChild(line);
    });
  }

  function buildRings(adjustView, options) {
    const settings = options || {};
    if (!state.mapReady) {
      return false;
    }
    window.clearTimeout(autoBuildTimer);
    if (!settings.skipInputRead && !readInputsIntoState({ suppressErrors: settings.suppressErrors })) {
      return false;
    }

    // Clear existing ring paths
    while (ringGeometry.firstChild) {
      ringGeometry.removeChild(ringGeometry.firstChild);
    }
    while (ringLabelsOverlay.firstChild) {
      ringLabelsOverlay.removeChild(ringLabelsOverlay.firstChild);
    }
    state.ringsData = [];

    const validDistances = state.distances.filter(km => km > 0);
    if (validDistances.length === 0) {
      renderMeta({ message: '距離が 0 km のため円は描画していません。' });
      render();
      updateLocationQuery();
      return true;
    }

    let totalFallbackCount = 0;
    let totalClippedCount = 0;

    validDistances.forEach((distanceKm, index) => {
      const distanceMeters = distanceKm * 1000;
      const pointCount = 720;
      const ringPoints = [];
      let fallbackCount = 0;
      let clippedCount = 0;

      for (let i = 0; i <= pointCount; i += 1) {
        const bearing = (i / pointCount) * 360;
        const result = vincentyDirect(state.selectedLat, state.selectedLon, bearing, distanceMeters);
        if (result.method !== 'vincenty') {
          fallbackCount += 1;
        }
        const normalizedLon = normalizeLon(result.lon);
        if (Math.abs(result.lat) > MERCATOR_MAX_LAT) {
          clippedCount += 1;
        }
        ringPoints.push({ lat: result.lat, lon: normalizedLon });
      }

      const ringProjection = buildProjectedRingPath(ringPoints);
      const d = ringProjection.pathData;

      const ringPath = createSvgElement('path');
      ringPath.setAttribute('d', d);
      ringPath.setAttribute('fill', 'none');
      ringPath.setAttribute('stroke', state.ringColor);
      ringPath.setAttribute('stroke-width', String(state.lineWidth));
      ringPath.setAttribute('stroke-linejoin', 'round');
      ringPath.setAttribute('stroke-linecap', 'round');
      ringPath.setAttribute('vector-effect', 'non-scaling-stroke');
      ringGeometry.appendChild(ringPath);

      const labelResult = vincentyDirect(state.selectedLat, state.selectedLon, 0, distanceKm * 1000);
      const labelX = lonToX(labelResult.lon);
      const labelY = latToY(labelResult.lat);
      const labelScale = getUiScaleWorld();
      const ringLabel = createSvgElement('text');
      ringLabel.setAttribute('x', formatSvgNumber(getWrappedXForCurrentView(labelX)));
      ringLabel.setAttribute('y', formatSvgNumber(labelY - 3 * labelScale));
      ringLabel.setAttribute('text-anchor', 'middle');
      ringLabel.setAttribute('fill', state.ringColor);
      ringLabel.setAttribute('font-size', formatSvgNumber(5 * labelScale));
      ringLabel.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
      ringLabel.setAttribute('font-weight', '600');
      ringLabel.setAttribute('paint-order', 'stroke');
      ringLabel.setAttribute('stroke', '#ffffff');
      ringLabel.setAttribute('stroke-width', formatSvgNumber(2 * labelScale));
      ringLabel.setAttribute('stroke-linejoin', 'round');
      ringLabel.textContent = `${formatDistance(distanceKm)} km`;
      ringLabelsOverlay.appendChild(ringLabel);

      state.ringsData.push({
        distanceKm,
        ringPoints,
        projectedPoints: ringProjection.visiblePoints,
        fallbackCount,
        clippedCount,
        pathElement: ringPath,
        labelElement: ringLabel,
        labelX,
        labelY,
      });

      totalFallbackCount += fallbackCount;
      totalClippedCount += clippedCount;
    });

    if (adjustView) {
      fitToRings();
    }

    render();
    renderMeta({
      fallbackCount: totalFallbackCount,
      clippedCount: totalClippedCount,
    });
    updateLocationQuery();

    if (totalFallbackCount > 0) {
      setStatus(`円を描きました。Vincenty が収束しない方位が ${totalFallbackCount} 点あったため、その点のみ球面近似へ自動フォールバックしました。`);
    } else if (totalClippedCount > 0) {
      setStatus(`円を描きました。メルカトル表示では ±${MERCATOR_MAX_LAT.toFixed(3)}° を超える部分を可視域外として分割表示しています。`);
    } else {
      setStatus('円を描きました。');
    }

    return true;
  }

  function fitToRings() {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    state.ringsData.forEach((ring) => {
      if (!ring.projectedPoints.length) return;
      ring.projectedPoints.forEach((point) => {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      });
    });

    if (!Number.isFinite(minX)) {
      return;
    }

    const aspect = getAspect();
    const width = Math.max(8, maxX - minX);
    const height = Math.max(8, maxY - minY);
    const paddedWidth = width * 1.12;
    const paddedHeight = height * 1.16;
    const zoomByWidth = WORLD_WIDTH / paddedWidth;
    const zoomByHeight = WORLD_WIDTH / (paddedHeight * aspect);
    state.zoom = clamp(Math.min(zoomByWidth, zoomByHeight), getMinZoom(), MAX_ZOOM);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const visibleHeight = WORLD_WIDTH / state.zoom / aspect;
    state.centerX = normalizeWorldX(centerX);
    state.centerY = clampCenterY(centerY, visibleHeight);
    render();
  }

  function getUiScaleWorld() {
    if (state.currentViewBox && Number.isFinite(state.currentViewBox.width) && state.currentViewBox.width > 0) {
      return state.currentViewBox.width / WORLD_WIDTH;
    }
    const zoom = clamp(state.zoom, getMinZoom(), MAX_ZOOM);
    return WORLD_WIDTH / zoom / WORLD_WIDTH;
  }

  function getWrappedXForCurrentView(x) {
    if (!Number.isFinite(x)) {
      return x;
    }
    if (!state.currentViewBox || !Number.isFinite(state.currentViewBox.x) || !Number.isFinite(state.currentViewBox.width)) {
      return x;
    }
    const viewCenterX = state.currentViewBox.x + state.currentViewBox.width / 2;
    const copyOffset = Math.round((viewCenterX - x) / WORLD_WIDTH);
    return x + copyOffset * WORLD_WIDTH;
  }

  function updateMarker() {
    const x = lonToX(state.selectedLon);
    const y = latToY(state.selectedLat);
    const scale = getUiScaleWorld();
    const size = 5.5 * scale;
    const dotRadius = 2.4 * scale;
    const fontSize = 5 * scale;
    const labelDy = 10 * scale;
    markerCross.setAttribute('d', [
      `M ${formatSvgNumber(x - size)} ${formatSvgNumber(y)}`,
      `L ${formatSvgNumber(x + size)} ${formatSvgNumber(y)}`,
      `M ${formatSvgNumber(x)} ${formatSvgNumber(y - size)}`,
      `L ${formatSvgNumber(x)} ${formatSvgNumber(y + size)}`,
    ].join(' '));
    markerDot.setAttribute('cx', formatSvgNumber(x));
    markerDot.setAttribute('cy', formatSvgNumber(y));
    markerDot.setAttribute('r', formatSvgNumber(dotRadius));
    markerLabel.setAttribute('x', formatSvgNumber(x));
    markerLabel.setAttribute('y', formatSvgNumber(y));
    markerLabel.setAttribute('font-size', formatSvgNumber(fontSize));
    markerLabel.setAttribute('stroke-width', formatSvgNumber(2 * scale));
    markerLabel.setAttribute('dy', formatSvgNumber(labelDy));
    markerLabel.textContent = state.label || '';
  }

  function updateRingLabels() {
    const scale = getUiScaleWorld();
    state.ringsData.forEach((ring) => {
      if (!ring.labelElement) return;
      ring.labelElement.setAttribute('x', formatSvgNumber(getWrappedXForCurrentView(ring.labelX)));
      ring.labelElement.setAttribute('font-size', formatSvgNumber(5 * scale));
      ring.labelElement.setAttribute('stroke-width', formatSvgNumber(2 * scale));
      if (ring.labelX != null) {
        ring.labelElement.setAttribute('y', formatSvgNumber(ring.labelY - 3 * scale));
      }
    });
  }

  function render() {
    if (!state.mapReady) {
      return;
    }
    ensureZoomWithinBounds();
    const aspect = getAspect();
    const viewWidth = WORLD_WIDTH / state.zoom;
    const viewHeight = viewWidth / aspect;
    const viewX = state.centerX - viewWidth / 2;
    const viewY = clampViewTop(state.centerY - viewHeight / 2, viewHeight);
    state.currentViewBox = {
      x: viewX,
      y: viewY,
      width: viewWidth,
      height: viewHeight,
    };
    els.map.setAttribute('viewBox', `${formatSvgNumber(viewX)} ${formatSvgNumber(viewY)} ${formatSvgNumber(viewWidth)} ${formatSvgNumber(viewHeight)}`);
    updateMarker();
    updateRingLabels();
    els.selectionCoords.textContent = `中心点: ${formatCoord(state.selectedLat)}, ${formatCoord(state.selectedLon)}`;
  }

  function renderMeta(info) {
    const parts = [];
    if (state.distances.length > 0) {
      const distancesStr = state.distances.map(d => formatDistance(d)).join(', ');
      parts.push(`距離: ${distancesStr} km`);
    }
    parts.push(`計算: WGS84 / Vincenty`);
    if (info && info.fallbackCount > 0) {
      parts.push(`球面フォールバック ${info.fallbackCount}点`);
    }
    if (info && info.clippedCount > 0) {
      parts.push(`表示端クリップ ${info.clippedCount}点`);
    }
    if (info && info.message) {
      parts.push(info.message);
    }
    els.ringMeta.textContent = parts.join(' / ');
  }

  function readInputsIntoState(options) {
    const settings = options || {};
    const lat = finiteNumber(els.latInput.value, NaN);
    const lon = finiteNumber(els.lonInput.value, NaN);
    const lineWidth = finiteNumber(els.lineWidthInput.value, NaN);

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      if (!settings.suppressErrors) {
        setStatus('緯度は -90 から 90 の範囲で入力してください。', 'error');
      }
      return false;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      if (!settings.suppressErrors) {
        setStatus('経度は -180 から 180 の範囲で入力してください。', 'error');
      }
      return false;
    }

    // Read distances from input fields
    const distanceInputs = els.distancesList.querySelectorAll('.distanceInput');
    const distances = [];
    distanceInputs.forEach((input) => {
      const km = parseFlexibleNumber(input.value);
      if (Number.isFinite(km) && km >= 0 && km <= 20000) {
        distances.push(km);
      }
    });

    if (distances.length === 0) {
      if (!settings.suppressErrors) {
        setStatus('少なくとも1つの有効な距離を入力してください（0〜20,000 km）。', 'error');
      }
      return false;
    }

    if (!Number.isFinite(lineWidth) || lineWidth < 0.5 || lineWidth > 12) {
      if (!settings.suppressErrors) {
        setStatus('線幅は 0.5 から 12 の範囲で入力してください。', 'error');
      }
      return false;
    }

    state.selectedLat = lat;
    state.selectedLon = normalizeLon(lon);
    state.distances = distances;
    state.ringColor = normalizeHexColor(els.colorInput.value, DEFAULT_COLOR);
    state.lineWidth = lineWidth;
    state.label = (els.labelInput.value || '').trim();
    return true;
  }

  function setInputsFromState() {
    els.latInput.value = formatInputNumber(state.selectedLat, 6);
    els.lonInput.value = formatInputNumber(state.selectedLon, 6);
    els.colorInput.value = state.ringColor;
    els.lineWidthInput.value = formatInputNumber(state.lineWidth, 2);
    els.labelInput.value = state.label;
    updateRingPathColors();
    updateRingPathWidths();
  }

  function renderDistancesList() {
    els.distancesList.innerHTML = '';
    state.distances.forEach((km, index) => {
      addDistanceInput(km, index);
    });
  }

  function addDistanceInput(km, index) {
    if (km === undefined) {
      // Add new distance (default to last distance + 500 or 500)
      const lastDistance = state.distances.length > 0 ? state.distances[state.distances.length - 1] : 500;
      km = lastDistance + 500;
      if (km > 20000) km = 20000;
      state.distances.push(km);
      index = state.distances.length - 1;
    }

    const item = document.createElement('div');
    item.className = 'distanceItem';
    item.dataset.index = index;

    const field = document.createElement('div');
    field.className = 'distanceField';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'distanceInput';
    input.inputMode = 'numeric';
    input.value = formatInputNumber(km, 2);
    input.setAttribute('aria-label', `距離 ${index + 1}`);

    const invalidHint = document.createElement('span');
    invalidHint.className = 'invalidHint';
    invalidHint.textContent = '数値で入力してください';

    input.addEventListener('input', () => {
      const rawValue = input.value;
      const parsed = parseFlexibleNumber(rawValue);
      if (rawValue.trim() === '') {
        item.classList.remove('invalid');
        return;
      }
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 20000) {
        item.classList.remove('invalid');
        scheduleAutoBuildFromInputs();
      } else {
        item.classList.add('invalid');
      }
    });

    input.addEventListener('change', () => {
      commitDistanceInput(input, item);
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitDistanceInput(input, item);
      }
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'removeBtn';
    removeBtn.textContent = '削除';
    removeBtn.addEventListener('click', () => {
      removeDistanceInput(index);
    });

    field.appendChild(input);
    field.appendChild(invalidHint);
    item.appendChild(field);
    item.appendChild(removeBtn);
    els.distancesList.appendChild(item);

    // Update remove button visibility
    updateRemoveButtons();
  }

  function commitDistanceInput(input, item) {
    const rawValue = input.value;
    const parsed = parseFlexibleNumber(rawValue);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 20000) {
      input.value = formatInputNumber(parsed, 2);
      item.classList.remove('invalid');
      buildRings(false);
      updateLocationQuery();
    } else if (rawValue.trim() === '') {
      item.classList.remove('invalid');
    } else {
      item.classList.add('invalid');
    }
  }

  function removeDistanceInput(index) {
    if (state.distances.length <= 1) {
      setStatus('少なくとも1つの円が必要です。', 'error');
      return;
    }
    state.distances.splice(index, 1);
    renderDistancesList();
    buildRings(false);
    updateLocationQuery();
  }

  function updateRemoveButtons() {
    const items = els.distancesList.querySelectorAll('.distanceItem');
    items.forEach((item) => {
      const removeBtn = item.querySelector('.removeBtn');
      if (state.distances.length <= 1) {
        removeBtn.style.display = 'none';
      } else {
        removeBtn.style.display = '';
      }
    });
  }

  function updateRingPathColors() {
    state.ringsData.forEach((ring) => {
      ring.pathElement.setAttribute('stroke', state.ringColor);
    });
  }

  function updateRingPathWidths() {
    state.ringsData.forEach((ring) => {
      ring.pathElement.setAttribute('stroke-width', String(state.lineWidth));
    });
  }

  function normalizeDistances(distances) {
    if (!Array.isArray(distances) || distances.length === 0) {
      return DEFAULT_DISTANCES.slice();
    }
    return distances.map(d => clamp(finiteNumber(d, 1000), 0, 20000)).filter(d => d >= 0);
  }

  function parseFlexibleNumber(str) {
    if (str == null) return NaN;
    let s = String(str).trim();
    if (s === '') return NaN;
    s = s.replace(/[,，\s]/g, '');
    s = s.replace(/[０-９]/g, function(c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    s = s.replace(/．/g, '.').replace(/＋/g, '+').replace(/－/g, '-');
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    return parseKanjiNumber(s);
  }

  function parseKanjiNumber(s) {
    var kanjiDigits = { '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
    var units = { '十': 10, '百': 100, '千': 1000 };
    var bigUnits = { '万': 10000, '億': 100000000 };
    var validChars = new Set(Object.keys(kanjiDigits).concat(Object.keys(units), Object.keys(bigUnits)));
    var chars = Array.from(s);
    for (var k = 0; k < chars.length; k++) {
      if (!validChars.has(chars[k])) return NaN;
    }
    var result = 0;
    var group = 0;
    var i = 0;
    while (i < chars.length) {
      var c = chars[i];
      if (kanjiDigits[c] !== undefined) {
        var d = kanjiDigits[c];
        if (i + 1 < chars.length) {
          var next = chars[i + 1];
          if (units[next] !== undefined) {
            group += d * units[next];
            i += 2;
            continue;
          }
          if (bigUnits[next] !== undefined) {
            group += d;
            result += group * bigUnits[next];
            group = 0;
            i += 2;
            continue;
          }
        }
        group += d;
        i += 1;
      } else if (units[c] !== undefined) {
        group += units[c];
        i += 1;
      } else if (bigUnits[c] !== undefined) {
        result += group * bigUnits[c];
        group = 0;
        i += 1;
      } else {
        return NaN;
      }
    }
    result += group;
    return result > 0 ? result : NaN;
  }

  function ensureZoomWithinBounds() {
    state.zoom = clamp(state.zoom, getMinZoom(), MAX_ZOOM);
    const visibleHeight = WORLD_WIDTH / state.zoom / getAspect();
    state.centerY = clampCenterY(state.centerY, visibleHeight);
    state.centerX = normalizeWorldX(state.centerX);
  }

  function nextAnimationFrame() {
    return new Promise((resolve) => {
      const frame = window.requestAnimationFrame || function(callback) {
        return window.setTimeout(callback, 16);
      };
      frame(() => resolve());
    });
  }

  function resetView() {
    state.zoom = getMinZoom();
    state.centerX = lonToX(finiteNumber(initialState.mapLon, DEFAULT_MAP_CENTER_LON));
    state.centerY = latToY(finiteNumber(initialState.mapLat, DEFAULT_MAP_CENTER_LAT));
    ensureZoomWithinBounds();
  }

  function getAspect() {
    const rect = els.map.getBoundingClientRect();
    const width = Math.max(320, rect.width || els.mapWrap.clientWidth || 320);
    const height = Math.max(320, rect.height || els.mapWrap.clientHeight || 320);
    return width / height;
  }

  function getMinZoom() {
    return Math.max(1, 1 / getAspect());
  }

  function clampCenterY(centerY, visibleHeight) {
    return clamp(centerY, visibleHeight / 2, WORLD_HEIGHT - visibleHeight / 2);
  }

  function clampViewTop(viewTop, visibleHeight) {
    return clamp(viewTop, 0, WORLD_HEIGHT - visibleHeight);
  }

  function clientToWorld(clientX, clientY) {
    const rect = els.map.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const view = state.currentViewBox;
    return {
      x: view.x + (px / rect.width) * view.width,
      y: view.y + (py / rect.height) * view.height,
    };
  }

  async function downloadSvg() {
    if (!state.mapReady) {
      return;
    }
    const svgText = buildExportSvg();
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, `${buildBaseFileName()}.svg`);
    setStatus('SVG をダウンロードしました。');
  }

  async function downloadPng() {
    if (!state.mapReady) {
      return;
    }
    const blob = await rasterizeCurrentSvg();
    downloadBlob(blob, `${buildBaseFileName()}.png`);
    setStatus('PNG をダウンロードしました。');
  }

  async function copyPngToClipboard() {
    if (!state.mapReady) {
      return;
    }
    if (!navigator.clipboard || typeof window.ClipboardItem === 'undefined') {
      setStatus('このブラウザでは画像クリップボードコピーに対応していません。PNG ダウンロードを使ってください。', 'error');
      return;
    }
    try {
      const blob = await rasterizeCurrentSvg();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setStatus('PNG をクリップボードへコピーしました。HTTPS 配信時のみ動作するブラウザがあります。');
    } catch (error) {
      console.error(error);
      setStatus('画像のクリップボードコピーに失敗しました。HTTPS 配信か、ブラウザ権限を確認してください。', 'error');
    }
  }

  function downloadGeoJson() {
    if (!state.ringsData.length || !state.ringsData.some(r => r.ringPoints.length)) {
      setStatus('先に円を描いてください。', 'error');
      return;
    }
    const featureCollection = buildRingsGeoJson();
    const blob = new Blob([JSON.stringify(featureCollection, null, 2)], { type: 'application/geo+json;charset=utf-8' });
    downloadBlob(blob, `${buildBaseFileName()}.geojson`);
    setStatus('GeoJSON をダウンロードしました。');
  }

  async function copyCurrentUrl() {
    updateLocationQuery();
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus('現在の表示状態を含む URL をコピーしました。');
    } catch (error) {
      console.error(error);
      setStatus('URL のコピーに失敗しました。', 'error');
    }
  }

  function buildRingsGeoJson() {
    const features = [
      {
        type: 'Feature',
        properties: {
          role: 'center',
          label: state.label || undefined,
        },
        geometry: {
          type: 'Point',
          coordinates: [round(state.selectedLon, 6), round(state.selectedLat, 6)],
        },
      },
    ];

    state.ringsData.forEach((ring) => {
      const ringSegments = splitRingAtDateline(ring.ringPoints);
      const coordinates = ringSegments.map((segment) => segment.map((point) => [round(point.lon, 6), round(point.lat, 6)]));

      if (coordinates.length > 0) {
        features.push({
          type: 'Feature',
          properties: {
            role: 'distance_ring',
            distance_km: round(ring.distanceKm, 3),
            ellipsoid: 'WGS84',
            method: 'vincenty_direct_with_spherical_fallback',
          },
          geometry: coordinates.length > 1 ? {
            type: 'MultiLineString',
            coordinates,
          } : {
            type: 'LineString',
            coordinates: coordinates[0] || [],
          },
        });
      }
    });

    return {
      type: 'FeatureCollection',
      features,
    };
  }

  function splitRingAtDateline(ringPoints) {
    if (!ringPoints.length) {
      return [];
    }
    const segments = [];
    let current = [{ lon: ringPoints[0].lon, lat: ringPoints[0].lat }];

    for (let i = 1; i < ringPoints.length; i += 1) {
      const prev = ringPoints[i - 1];
      const curr = ringPoints[i];
      let delta = curr.lon - prev.lon;
      if (delta > 180 || delta < -180) {
        const direction = delta > 180 ? -1 : 1;
        const prevUnwrapped = prev.lon;
        const currUnwrapped = curr.lon + direction * 360;
        const boundary = direction > 0 ? 180 : -180;
        const oppositeBoundary = -boundary;
        const t = (boundary - prevUnwrapped) / (currUnwrapped - prevUnwrapped);
        const latCross = prev.lat + (curr.lat - prev.lat) * t;
        current.push({ lon: boundary, lat: latCross });
        segments.push(current);
        current = [{ lon: oppositeBoundary, lat: latCross }, { lon: curr.lon, lat: curr.lat }];
      } else {
        current.push({ lon: curr.lon, lat: curr.lat });
      }
    }

    if (current.length) {
      segments.push(current);
    }

    return segments.filter((segment) => segment.length > 1);
  }

  function buildExportSvg() {
    const clone = els.map.cloneNode(true);
    clone.setAttribute('xmlns', svgNs);
    clone.setAttribute('xmlns:xlink', xlinkNs);
    clone.setAttribute('width', String(Math.max(800, els.mapWrap.clientWidth)));
    clone.setAttribute('height', String(Math.max(480, els.mapWrap.clientHeight)));
    const title = createSvgElement('title');
    const distancesStr = state.distances.map(d => `${d}km`).join(', ');
    title.textContent = `Distance rings ${distancesStr} from ${state.selectedLat}, ${state.selectedLon}`;
    clone.insertBefore(title, clone.firstChild);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  }

  function downloadEps() {
    if (!state.mapReady) {
      setStatus('先に地図を読み込んでください。', 'error');
      return;
    }
    if (!state.ringsData.length || !state.ringsData.some(r => r.projectedPoints.length)) {
      setStatus('先に円を描いてください。', 'error');
      return;
    }

    const epsContent = buildExportEps();
    const blob = new Blob([epsContent], { type: 'application/postscript;charset=utf-8' });
    downloadBlob(blob, `${buildBaseFileName()}.eps`);
    setStatus('EPS をダウンロードしました。');
  }

  function buildExportEps() {
    const svgWidth = Math.max(800, els.mapWrap.clientWidth);
    const svgHeight = Math.max(480, els.mapWrap.clientHeight);
    const viewBox = state.currentViewBox;

    const paths = [];

    // 1. World map paths
    const mapPaths = mapGeometry.querySelectorAll('path');
    mapPaths.forEach((path) => {
      const d = path.getAttribute('d');
      if (d) {
        const transform = path.getAttribute('transform') || '';
        const offsetMatch = transform.match(/translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
        const offsetX = offsetMatch ? parseFloat(offsetMatch[1]) : 0;
        const offsetY = offsetMatch ? parseFloat(offsetMatch[2]) : 0;

        // Only include paths in the center copy (offset near 0)
        if (Math.abs(offsetX) < 180) {
          paths.push({
            type: 'path',
            d: d,
            offsetX: offsetX,
            offsetY: offsetY,
            fill: path.getAttribute('fill') || '#ffffff',
            stroke: path.getAttribute('stroke') || '#b8c1c9',
            strokeWidth: parseFloat(path.getAttribute('stroke-width')) || 0.6,
            viewBox: viewBox,
          });
        }
      }
    });

    // 2. Graticule lines
    const mapLines = mapGeometry.querySelectorAll('line');
    mapLines.forEach((line) => {
      paths.push({
        type: 'line',
        x1: parseFloat(line.getAttribute('x1')),
        y1: parseFloat(line.getAttribute('y1')),
        x2: parseFloat(line.getAttribute('x2')),
        y2: parseFloat(line.getAttribute('y2')),
        stroke: line.getAttribute('stroke') || '#dde4ea',
        strokeWidth: parseFloat(line.getAttribute('stroke-width')) || 0.6,
        viewBox: viewBox,
      });
    });

    // 3. Distance ring paths
    state.ringsData.forEach((ring) => {
      const ringD = ring.pathElement.getAttribute('d');
      if (ringD) {
        paths.push({
          type: 'path',
          d: ringD,
          offsetX: 0,
          offsetY: 0,
          fill: 'none',
          stroke: state.ringColor,
          strokeWidth: state.lineWidth,
          viewBox: viewBox,
        });
      }
    });

    // 4. Center marker
    const markerX = lonToX(state.selectedLon);
    const markerY = latToY(state.selectedLat);
    const markerScale = getUiScaleWorld();
    const markerSize = 5.5 * markerScale;

    paths.push({
      type: 'cross',
      cx: markerX,
      cy: markerY,
      size: markerSize,
      stroke: '#1f2933',
      strokeWidth: 1.5,
      viewBox: viewBox,
    });

    paths.push({
      type: 'circle',
      cx: markerX,
      cy: markerY,
      r: 2.4 * markerScale,
      fill: '#ffffff',
      stroke: '#1f2933',
      strokeWidth: 1.4,
      viewBox: viewBox,
    });

    if (state.label) {
      paths.push({
        type: 'text',
        x: markerX,
        y: markerY + 10 * markerScale,
        text: state.label,
        fontSize: 5 * markerScale,
        fill: '#1f2933',
        viewBox: viewBox,
      });
    }

    return generateEpsContent(paths, svgWidth, svgHeight, viewBox);
  }

  function generateEpsContent(paths, width, height, viewBox) {
    const lines = [];

    // EPS header
    lines.push('%!PS-Adobe-3.0 EPSF-3.0');
    lines.push(`%%BoundingBox: 0 0 ${Math.ceil(width)} ${Math.ceil(height)}`);
    const distancesStr = state.distances.map(d => `${d}km`).join(', ');
    lines.push(`%%Title: Distance rings ${distancesStr} from (${state.selectedLat}, ${state.selectedLon})`);
    lines.push('%%Creator: Mercator Radius Tool');
    lines.push('%%CreationDate: ' + new Date().toISOString().split('T')[0]);
    lines.push('%%EndComments');
    lines.push('');

    // Graphics state
    lines.push('gsave');
    lines.push('1 setlinejoin');
    lines.push('1 setlinecap');
    lines.push('');

    // Transform functions
    const tx = (x) => (x - viewBox.x) * (width / viewBox.width);
    const ty = (y) => height - (y - viewBox.y) * (height / viewBox.height);

    paths.forEach((item) => {
      if (item.type === 'rect') {
        lines.push('% Background');
        lines.push('newpath');
        lines.push(`0 0 moveto`);
        lines.push(`${epsNumber(item.width)} 0 lineto`);
        lines.push(`${epsNumber(item.width)} ${epsNumber(item.height)} lineto`);
        lines.push(`0 ${epsNumber(item.height)} lineto`);
        lines.push('closepath');
        lines.push(`${epsColor(item.fill)} setrgbcolor`);
        lines.push('fill');
        lines.push('');
      }
      else if (item.type === 'path') {
        const psPath = svgPathToPostScript(item.d, tx, ty, item.offsetX || 0, item.offsetY || 0);
        if (psPath) {
          lines.push('newpath');
          lines.push(psPath);

          if (item.fill && item.fill !== 'none') {
            lines.push(`${epsColor(item.fill)} setrgbcolor`);
            if (item.stroke && item.stroke !== 'none') {
              lines.push('gsave fill grestore');
              lines.push(`${epsColor(item.stroke)} setrgbcolor`);
              lines.push(`${epsNumber(item.strokeWidth)} setlinewidth`);
              lines.push('stroke');
            } else {
              lines.push('fill');
            }
          } else if (item.stroke && item.stroke !== 'none') {
            lines.push(`${epsColor(item.stroke)} setrgbcolor`);
            lines.push(`${epsNumber(item.strokeWidth)} setlinewidth`);
            lines.push('stroke');
          }
          lines.push('');
        }
      }
      else if (item.type === 'line') {
        lines.push('newpath');
        lines.push(`${epsNumber(tx(item.x1))} ${epsNumber(ty(item.y1))} moveto`);
        lines.push(`${epsNumber(tx(item.x2))} ${epsNumber(ty(item.y2))} lineto`);
        lines.push(`${epsColor(item.stroke)} setrgbcolor`);
        lines.push(`${epsNumber(item.strokeWidth)} setlinewidth`);
        lines.push('stroke');
        lines.push('');
      }
      else if (item.type === 'cross') {
        const cx = tx(item.cx);
        const cy = ty(item.cy);
        const s = item.size;

        lines.push('newpath');
        lines.push(`${epsNumber(cx - s)} ${epsNumber(cy)} moveto`);
        lines.push(`${epsNumber(cx + s)} ${epsNumber(cy)} lineto`);
        lines.push(`${epsNumber(cx)} ${epsNumber(cy - s)} moveto`);
        lines.push(`${epsNumber(cx)} ${epsNumber(cy + s)} lineto`);
        lines.push(`${epsColor(item.stroke)} setrgbcolor`);
        lines.push(`${epsNumber(item.strokeWidth)} setlinewidth`);
        lines.push('stroke');
        lines.push('');
      }
      else if (item.type === 'circle') {
        const cx = tx(item.cx);
        const cy = ty(item.cy);
        const r = item.r;

        lines.push('newpath');
        lines.push(`${epsNumber(cx)} ${epsNumber(cy)} ${epsNumber(r)} 0 360 arc`);
        lines.push('closepath');
        lines.push(`${epsColor(item.fill)} setrgbcolor`);
        lines.push('gsave fill grestore');
        lines.push(`${epsColor(item.stroke)} setrgbcolor`);
        lines.push(`${epsNumber(item.strokeWidth)} setlinewidth`);
        lines.push('stroke');
        lines.push('');
      }
      else if (item.type === 'text') {
        const x = tx(item.x);
        const y = ty(item.y);
        const fontSize = item.fontSize * (width / viewBox.width);
        const escapedText = epsEscapePsString(item.text);

        lines.push(`/Helvetica-Bold findfont ${epsNumber(fontSize)} scalefont setfont`);
        lines.push('gsave');
        lines.push(`${epsNumber(x)} ${epsNumber(y)} moveto`);
        lines.push(`(${escapedText}) dup stringwidth pop 2 div neg 0 rmoveto`);
        lines.push('1 1 1 setrgbcolor');
        lines.push(`${epsNumber(fontSize * 0.5)} setlinewidth`);
        lines.push('true charpath stroke');
        lines.push('grestore');
        lines.push(`${epsNumber(x)} ${epsNumber(y)} moveto`);
        lines.push(`(${escapedText}) dup stringwidth pop 2 div neg 0 rmoveto`);
        lines.push(`${epsColor(item.fill)} setrgbcolor`);
        lines.push('show');
        lines.push('');
      }
    });

    lines.push('grestore');
    lines.push('showpage');
    lines.push('%%EOF');

    return lines.join('\n');
  }

  function svgPathToPostScript(svgD, tx, ty, offsetX, offsetY) {
    if (!svgD) return '';

    const commands = [];
    const tokens = svgD.match(/[MLZ]|[-\d.e]+/gi) || [];

    let i = 0;
    while (i < tokens.length) {
      const cmd = tokens[i].toUpperCase();

      if (cmd === 'M' || cmd === 'L') {
        const x = parseFloat(tokens[i + 1]) + offsetX;
        const y = parseFloat(tokens[i + 2]) + offsetY;
        if (Number.isFinite(x) && Number.isFinite(y)) {
          commands.push(`${epsNumber(tx(x))} ${epsNumber(ty(y))} ${cmd === 'M' ? 'moveto' : 'lineto'}`);
        }
        i += 3;
      }
      else if (cmd === 'Z') {
        commands.push('closepath');
        i += 1;
      }
      else if (!isNaN(parseFloat(cmd))) {
        const x = parseFloat(tokens[i]) + offsetX;
        const y = parseFloat(tokens[i + 1]) + offsetY;
        if (Number.isFinite(x) && Number.isFinite(y)) {
          commands.push(`${epsNumber(tx(x))} ${epsNumber(ty(y))} lineto`);
        }
        i += 2;
      }
      else {
        i += 1;
      }
    }

    return commands.join('\n');
  }

  function epsColor(hexColor) {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    return `${epsNumber(r)} ${epsNumber(g)} ${epsNumber(b)}`;
  }

  function epsNumber(value) {
    const num = Number(value);
    if (Math.abs(num) < 0.00001) return '0';
    return num.toFixed(5).replace(/\.?0+$/, '');
  }

  function epsEscapePsString(str) {
    return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  async function rasterizeCurrentSvg() {
    const svgText = buildExportSvg();
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    try {
      const image = await loadImage(url);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(800, Math.round(els.mapWrap.clientWidth * EXPORT_SCALE));
      canvas.height = Math.max(480, Math.round(els.mapWrap.clientHeight * EXPORT_SCALE));
      const context = canvas.getContext('2d');
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to encode PNG.'));
          }
        }, 'image/png');
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load raster image from SVG.'));
      image.src = url;
    });
  }

  function updateLocationQuery() {
    const url = new URL(window.location.href);
    url.searchParams.set('lat', round(state.selectedLat, 6));
    url.searchParams.set('lon', round(state.selectedLon, 6));
    url.searchParams.set('km', state.distances.map(d => round(d, 3)).join(','));
    url.searchParams.set('color', state.ringColor);
    url.searchParams.set('lineWidth', round(state.lineWidth, 2));
    if (state.label) {
      url.searchParams.set('label', state.label);
    } else {
      url.searchParams.delete('label');
    }
    url.searchParams.set('mapLat', round(yToLat(state.centerY), 6));
    url.searchParams.set('mapLon', round(normalizeLon(state.centerX - 180), 6));
    url.searchParams.set('zoom', round(state.zoom, 4));
    window.history.replaceState(null, '', url.toString());
  }

  function geometryToPath(geometry) {
    if (!geometry || !geometry.type || !geometry.coordinates) {
      return '';
    }
    if (geometry.type === 'Polygon') {
      return polygonToPath(geometry.coordinates);
    }
    if (geometry.type === 'MultiPolygon') {
      return geometry.coordinates.map((polygon) => polygonToPath(polygon)).join(' ');
    }
    return '';
  }

  function polygonToPath(polygon) {
    return polygon.map((ring) => linePathFromLonLat(ring, true)).join(' ');
  }

  function linePathFromLonLat(coords, closePath) {
    if (!Array.isArray(coords) || !coords.length) {
      return '';
    }
    const projected = coords.map((coord) => ({ lon: coord[0], lat: coord[1], x: 0, y: latToY(coord[1]) }));
    unwrapProjectedLongitudes(projected);
    return linePathFromProjectedPoints(projected, closePath);
  }

  function linePathFromProjectedPoints(points, closePath) {
    if (!points.length) {
      return '';
    }
    const commands = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${formatSvgNumber(point.x)} ${formatSvgNumber(point.y)}`);
    return commands.join(' ') + (closePath ? ' Z' : '');
  }

  function buildProjectedRingPath(ringPoints) {
    if (!Array.isArray(ringPoints) || ringPoints.length < 2) {
      return { pathData: '', visiblePoints: [] };
    }

    const projected = ringPoints.map((point) => ({
      lon: point.lon,
      x: 0,
      rawY: latToMercatorYRaw(point.lat),
    }));
    unwrapProjectedLongitudes(projected);

    const segments = clipProjectedPolylineToMercator(projected);
    const visiblePoints = [];
    segments.forEach((segment) => {
      segment.forEach((point) => {
        visiblePoints.push({ x: point.x, y: point.y });
      });
    });

    return {
      pathData: pathFromProjectedSegments(segments),
      visiblePoints,
    };
  }

  function clipProjectedPolylineToMercator(points) {
    const segments = [];
    let current = [];

    for (let i = 1; i < points.length; i += 1) {
      const clipped = clipProjectedSegmentToMercator(points[i - 1], points[i]);

      if (!clipped) {
        if (current.length > 1) {
          segments.push(current);
        }
        current = [];
        continue;
      }

      const segmentStart = clipped[0];
      const segmentEnd = clipped[1];

      if (!current.length) {
        current.push(segmentStart);
      } else if (!sameProjectedPoint(current[current.length - 1], segmentStart)) {
        if (current.length > 1) {
          segments.push(current);
        }
        current = [segmentStart];
      }

      pushUniqueProjectedPoint(current, segmentEnd);
    }

    if (current.length > 1) {
      segments.push(current);
    }

    return segments;
  }

  function clipProjectedSegmentToMercator(start, end) {
    const startVisible = isVisibleMercatorY(start.rawY);
    const endVisible = isVisibleMercatorY(end.rawY);

    if (startVisible && endVisible) {
      return [
        { x: start.x, y: clamp(start.rawY, 0, WORLD_HEIGHT) },
        { x: end.x, y: clamp(end.rawY, 0, WORLD_HEIGHT) },
      ];
    }

    if ((start.rawY < 0 && end.rawY < 0) || (start.rawY > WORLD_HEIGHT && end.rawY > WORLD_HEIGHT)) {
      return null;
    }

    const deltaY = end.rawY - start.rawY;
    if (Math.abs(deltaY) < 1e-9) {
      return null;
    }

    let tStart = 0;
    let tEnd = 1;

    if (start.rawY < 0 || end.rawY < 0) {
      const tAtTop = (0 - start.rawY) / deltaY;
      if (start.rawY < 0) {
        tStart = Math.max(tStart, tAtTop);
      } else {
        tEnd = Math.min(tEnd, tAtTop);
      }
    }

    if (start.rawY > WORLD_HEIGHT || end.rawY > WORLD_HEIGHT) {
      const tAtBottom = (WORLD_HEIGHT - start.rawY) / deltaY;
      if (start.rawY > WORLD_HEIGHT) {
        tStart = Math.max(tStart, tAtBottom);
      } else {
        tEnd = Math.min(tEnd, tAtBottom);
      }
    }

    tStart = clamp(tStart, 0, 1);
    tEnd = clamp(tEnd, 0, 1);
    if (tStart > tEnd) {
      return null;
    }

    const clippedStart = interpolateProjectedPoint(start, end, tStart);
    const clippedEnd = interpolateProjectedPoint(start, end, tEnd);
    if (sameProjectedPoint(clippedStart, clippedEnd)) {
      return null;
    }

    return [clippedStart, clippedEnd];
  }

  function interpolateProjectedPoint(start, end, t) {
    const rawY = start.rawY + (end.rawY - start.rawY) * t;
    return {
      x: start.x + (end.x - start.x) * t,
      y: clamp(rawY, 0, WORLD_HEIGHT),
    };
  }

  function pathFromProjectedSegments(segments) {
    return segments.map((segment) => {
      return segment.map((point, index) => {
        return `${index === 0 ? 'M' : 'L'} ${formatSvgNumber(point.x)} ${formatSvgNumber(point.y)}`;
      }).join(' ');
    }).join(' ');
  }

  function pushUniqueProjectedPoint(points, point) {
    if (!points.length || !sameProjectedPoint(points[points.length - 1], point)) {
      points.push(point);
    }
  }

  function sameProjectedPoint(a, b) {
    if (!a || !b) {
      return false;
    }
    return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
  }

  function isVisibleMercatorY(rawY) {
    return rawY >= 0 && rawY <= WORLD_HEIGHT;
  }

  function unwrapProjectedLongitudes(points) {
    if (!points.length) {
      return;
    }
    let previousRawLon = points[0].lon;
    let unwrappedLon = previousRawLon;
    points[0].x = lonToX(unwrappedLon);

    for (let i = 1; i < points.length; i += 1) {
      const rawLon = points[i].lon;
      let delta = rawLon - previousRawLon;
      if (delta > 180) {
        delta -= 360;
      } else if (delta < -180) {
        delta += 360;
      }
      unwrappedLon += delta;
      previousRawLon = rawLon;
      points[i].x = lonToX(unwrappedLon);
    }
  }

  function vincentyDirect(latDeg, lonDeg, bearingDeg, distanceMeters) {
    const a = WGS84.a;
    const b = WGS84.b;
    const f = WGS84.f;

    const alpha1 = degToRad(bearingDeg);
    const sinAlpha1 = Math.sin(alpha1);
    const cosAlpha1 = Math.cos(alpha1);
    const phi1 = degToRad(latDeg);
    const lambda1 = degToRad(lonDeg);

    const tanU1 = (1 - f) * Math.tan(phi1);
    const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1);
    const sinU1 = tanU1 * cosU1;
    const sigma1 = Math.atan2(tanU1, cosAlpha1);
    const sinAlpha = cosU1 * sinAlpha1;
    const cosSqAlpha = 1 - sinAlpha * sinAlpha;
    const uSq = cosSqAlpha * (a * a - b * b) / (b * b);
    const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
    const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));

    let sigma = distanceMeters / (b * A);
    let sigmaPrev = Number.POSITIVE_INFINITY;
    let iterations = 0;
    let cos2SigmaM = 0;
    let sinSigma = 0;
    let cosSigma = 0;
    let deltaSigma = 0;

    while (Math.abs(sigma - sigmaPrev) > 1e-12 && iterations < 200) {
      cos2SigmaM = Math.cos(2 * sigma1 + sigma);
      sinSigma = Math.sin(sigma);
      cosSigma = Math.cos(sigma);
      deltaSigma = B * sinSigma * (
        cos2SigmaM +
        (B / 4) * (
          cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)
        )
      );
      sigmaPrev = sigma;
      sigma = distanceMeters / (b * A) + deltaSigma;
      iterations += 1;
    }

    if (!Number.isFinite(sigma) || iterations >= 200) {
      return sphericalDirect(latDeg, lonDeg, bearingDeg, distanceMeters);
    }

    sinSigma = Math.sin(sigma);
    cosSigma = Math.cos(sigma);
    cos2SigmaM = Math.cos(2 * sigma1 + sigma);

    const tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1;
    const phi2 = Math.atan2(
      sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1,
      (1 - f) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp)
    );
    const lambda = Math.atan2(
      sinSigma * sinAlpha1,
      cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1
    );
    const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
    const L = lambda - (1 - C) * f * sinAlpha * (
      sigma + C * sinSigma * (
        cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)
      )
    );
    const lambda2 = lambda1 + L;

    return {
      lat: radToDeg(phi2),
      lon: normalizeLon(radToDeg(lambda2)),
      method: 'vincenty',
    };
  }

  function sphericalDirect(latDeg, lonDeg, bearingDeg, distanceMeters) {
    const delta = distanceMeters / WGS84.meanRadius;
    const theta = degToRad(bearingDeg);
    const phi1 = degToRad(latDeg);
    const lambda1 = degToRad(lonDeg);
    const sinPhi1 = Math.sin(phi1);
    const cosPhi1 = Math.cos(phi1);
    const sinDelta = Math.sin(delta);
    const cosDelta = Math.cos(delta);
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    const sinPhi2 = sinPhi1 * cosDelta + cosPhi1 * sinDelta * cosTheta;
    const phi2 = Math.asin(clamp(sinPhi2, -1, 1));
    const lambda2 = lambda1 + Math.atan2(
      sinTheta * sinDelta * cosPhi1,
      cosDelta - sinPhi1 * Math.sin(phi2)
    );

    return {
      lat: radToDeg(phi2),
      lon: normalizeLon(radToDeg(lambda2)),
      method: 'spherical',
    };
  }

  function lonToX(lonDeg) {
    return lonDeg + 180;
  }

  function latToMercatorYRaw(latDeg) {
    const safeLat = clamp(latDeg, -89.999999, 89.999999);
    const radians = degToRad(safeLat);
    const mercYDegrees = radToDeg(Math.log(Math.tan(Math.PI / 4 + radians / 2)));
    return 180 - mercYDegrees;
  }

  function latToY(latDeg) {
    return clamp(latToMercatorYRaw(latDeg), 0, WORLD_HEIGHT);
  }

  function yToLat(y) {
    const mercYRadians = degToRad(180 - y);
    return radToDeg(2 * Math.atan(Math.exp(mercYRadians)) - Math.PI / 2);
  }

  function formatCoord(value) {
    return Number(value).toFixed(4);
  }

  function formatDistance(value) {
    return Number(value).toLocaleString('ja-JP', {
      minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
      maximumFractionDigits: 2,
    });
  }

  function formatInputNumber(value, decimals) {
    return stripTrailingZeros(Number(value).toFixed(decimals));
  }

  function stripTrailingZeros(value) {
    return value.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  function formatSvgNumber(value) {
    return Number(value).toFixed(5).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  function buildBaseFileName() {
    const distancesStr = state.distances.map(d => `${round(d, 0)}km`).join('-');
    return [
      'distance-rings',
      `${round(state.selectedLat, 4)}`,
      `${round(state.selectedLon, 4)}`,
      distancesStr,
    ].join('_').replace(/[^0-9A-Za-z._-]+/g, '_');
  }

  function createCopyGroup(symbolId) {
    const group = createSvgElement('g');
    [-360, 0, 360].forEach((offset) => {
      const use = createSvgElement('use');
      use.setAttributeNS(xlinkNs, 'href', `#${symbolId}`);
      use.setAttribute('href', `#${symbolId}`);
      use.setAttribute('x', String(offset));
      group.appendChild(use);
    });
    return group;
  }

  function createSvgElement(name) {
    return document.createElementNS(svgNs, name);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function setStatus(message, type) {
    els.status.textContent = message;
    els.status.dataset.type = type || 'info';
  }

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeHexColor(value, fallback) {
    return /^#[0-9a-fA-F]{6}$/.test(String(value)) ? String(value).toLowerCase() : fallback;
  }

  function normalizeLon(lon) {
    let result = ((lon + 180) % 360 + 360) % 360 - 180;
    if (result === -180 && lon > 0) {
      result = 180;
    }
    return result;
  }

  function normalizeWorldX(x) {
    return ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function degToRad(value) {
    return value * (Math.PI / 180);
  }

  function radToDeg(value) {
    return value * (180 / Math.PI);
  }

  function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }
}

function queryRequired(root, selector) {
  const element = root.querySelector(selector);
  if (!element) {
    throw new Error(`Required element not found: ${selector}`);
  }
  return element;
}

function addManagedListener(abortController, target, eventName, listener, options) {
  if (typeof options === 'boolean') {
    target.addEventListener(eventName, listener, {
      capture: options,
      signal: abortController.signal,
    });
    return;
  }

  target.addEventListener(eventName, listener, {
    ...(options || {}),
    signal: abortController.signal,
  });
}

function getInitialStateFromLocation(search) {
  const searchParams = new URLSearchParams(search);

  return {
    lat: getFloatParam(searchParams, 'lat', DEFAULT_LAT),
    lon: getFloatParam(searchParams, 'lon', DEFAULT_LON),
    distances: getDistancesParam(searchParams, 'km', DEFAULT_DISTANCES),
    color: getColorParam(searchParams, 'color', DEFAULT_COLOR),
    lineWidth: getFloatParam(searchParams, 'lineWidth', DEFAULT_LINE_WIDTH),
    mapLat: getFloatParam(searchParams, 'mapLat', DEFAULT_MAP_CENTER_LAT),
    mapLon: getFloatParam(searchParams, 'mapLon', DEFAULT_MAP_CENTER_LON),
    zoom: getFloatParam(searchParams, 'zoom', 1),
    label: searchParams.has('label')
      ? (searchParams.get('label') || '').trim()
      : DEFAULT_LABEL,
  };
}

function getFloatParam(searchParams, name, fallback) {
  const value = searchParams.get(name);
  if (value == null || value === '') {
    return fallback;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getColorParam(searchParams, name, fallback) {
  const value = searchParams.get(name);
  if (value && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toLowerCase();
  }
  return fallback;
}

function getDistancesParam(searchParams, name, defaults) {
  const value = searchParams.get(name);
  if (!value) {
    return defaults.slice();
  }

  const distances = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part));

  return distances.length > 0 ? distances : defaults.slice();
}
