"use client";

import { useEffect, useRef } from "react";
import { mountMercatorRadiusTool } from "../lib/mercator-radius-tool";

export default function MercatorRadiusTool() {
  const rootRef = useRef(null);

  useEffect(() => {
    if (!rootRef.current) {
      return undefined;
    }

    return mountMercatorRadiusTool(rootRef.current);
  }, []);

  return (
    <div ref={rootRef}>
      <div className="app">
        <aside className="panel">
          <h1>等距離リング on メルカトル</h1>
          <p className="lead">
            地図をクリックして中心点を決め、距離を km で入れると、その地点からの等距離線を
            <b>球が球面である歪みを考慮</b>
            して描きます。<b>メディア業界に嬉しいEPS形式のダウンロード可能！</b>{" "}
            パブリックドメインの
            <a
              href="https://www.naturalearthdata.com/"
              target="_blank"
              rel="noreferrer"
            >
              Natural Earth
            </a>
            の地図データなので、権利表記不要で商用利用などあらゆる利用が自由です。
          </p>

          <div className="grid">
            <div className="field">
              <label htmlFor="latInput">緯度</label>
              <input
                id="latInput"
                type="number"
                step="0.000001"
                inputMode="decimal"
                aria-label="緯度"
              />
            </div>
            <div className="field">
              <label htmlFor="lonInput">経度</label>
              <input
                id="lonInput"
                type="number"
                step="0.000001"
                inputMode="decimal"
                aria-label="経度"
              />
            </div>
          </div>

          <div className="field fieldSpacing">
            <label htmlFor="labelInput">中心ラベル</label>
            <input
              id="labelInput"
              type="text"
              placeholder="中心地"
              aria-label="中心ラベル"
            />
          </div>

          <div className="distancesSection">
            <div className="distancesHeader">
              <label>距離 (km)</label>
              <button
                id="addRingBtn"
                type="button"
                className="smallBtn"
                title="円を追加"
              >
                ＋ 追加
              </button>
            </div>
            <div id="distancesList" className="distancesList"></div>
          </div>

          <div className="grid">
            <div className="field">
              <label htmlFor="colorInput">線の色</label>
              <input id="colorInput" type="color" aria-label="線色" />
            </div>
            <div className="field">
              <label htmlFor="lineWidthInput">線幅</label>
              <input
                id="lineWidthInput"
                type="number"
                min="0.5"
                max="12"
                step="0.5"
                inputMode="decimal"
                aria-label="線幅"
              />
            </div>
          </div>

          <div className="viewActions">
            <button id="fitBtn" type="button">
              円に合わせて表示
            </button>
            <button id="worldBtn" type="button">
              全体表示へ戻す
            </button>
          </div>

          <div className="exports">
            <button id="downloadSvgBtn" type="button">
              SVG ダウンロード
            </button>
            <button id="downloadEpsBtn" type="button">
              EPS ダウンロード
            </button>
            <button id="downloadPngBtn" type="button">
              PNG ダウンロード
            </button>
            <button id="copyPngBtn" type="button">
              PNG をコピー
            </button>
            <button id="downloadGeoJsonBtn" type="button">
              GeoJSON ダウンロード
            </button>
            <button id="copyUrlBtn" type="button">
              結果 URL をコピー
            </button>
          </div>

          <div className="meta">
            <div>
              <strong>中心点</strong>
              <span id="selectionCoords">—</span>
            </div>
            <div>
              <strong>カーソル</strong>
              <span id="cursorCoords">カーソル座標: —</span>
            </div>
            <div>
              <strong>円情報</strong>
              <span id="ringMeta">—</span>
            </div>
          </div>

          <div id="status" className="status" data-type="info">
            読み込み中…
          </div>

          <details className="notes">
            <summary>補足</summary>
            <div className="inner">
              <p>
                描画している地図はメルカトル図法です。したがって、画面上の見た目は円になりません。一定距離の地点集合を投影した結果として歪んだ閉曲線になります。
              </p>
              <p>
                距離は WGS84 楕円体上で Vincenty の direct problem
                を解いています。反対側付近などで反復が収束しない方位だけ、球面近似へ自動フォールバックします。
              </p>
              <p>
                メルカトル表示は上下端で <code>±85.05112878°</code>{" "}
                までです。極域へ出る線は可視域外として省略し、上下端で分割表示します。
              </p>
              <p>
                外部タイルは使っていません。白地図はパブリックドメイン
                <a
                  href="https://www.naturalearthdata.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Natural Earth
                </a>
                由来のオープンデータを使用しているため、自由に利用可能です。出典の表記も不要です。
              </p>
            </div>
          </details>
        </aside>

        <section className="mapCard">
          <div className="mapHeader">
            <div>
              <h2>地図</h2>
              <div className="small">
                ドラッグで移動、ホイールで拡大縮小、クリックで中心点を設定
              </div>
            </div>
          </div>
          <div className="mapWrap" id="mapWrap">
            <svg id="map" viewBox="0 0 360 180" aria-label="世界地図"></svg>
            <div className="zoomButtons" aria-hidden="false">
              <button id="zoomInBtn" type="button" title="拡大">
                ＋
              </button>
              <button id="zoomOutBtn" type="button" title="縮小">
                －
              </button>
            </div>
            <div className="footerText">
              Basemap: Natural Earth derived data / Distance ring: computed
              in-browser on WGS84
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
