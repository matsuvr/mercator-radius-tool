# 等距離リング on メルカトル

メルカトル図法の世界地図上に、指定地点から一定距離の等距離リングを描く Next.js アプリです。地図描画、WGS84 楕円体での計算、SVG / EPS / PNG / GeoJSON 出力はブラウザ内で完結します。

## 主な機能

- 地図クリックで中心点を設定
- 複数距離の等距離リングを描画
- 線色、線幅、中心ラベルを変更
- URL に表示状態を保存
- SVG / EPS / PNG / GeoJSON を出力

## 開発

```bash
npm install
npm run dev
```

`http://localhost:3000` を開いてください。

## スクリプト

- `npm run dev`
- `npm run lint`
- `npm run build`
- `npm run start`

## データ

白地図は Natural Earth 由来のデータです。詳細は `THIRD_PARTY.md` を参照してください。

## 補足

- API、データベース、認証、必須の環境変数はありません。
- 旧 PHP 版の `index.php` / `assets/` / `data/` は参考用に残していますが、`.gitignore` で除外しています。

## License

Apache License 2.0. 詳細は `LICENSE` を参照してください。
