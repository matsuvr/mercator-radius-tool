import "./globals.css";

export const metadata = {
  title: "等距離リング on メルカトル",
  description:
    "メルカトル図法の白地図上に、指定地点から一定距離の等距離線を描くツールです。",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
