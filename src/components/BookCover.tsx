import { useEffect, useMemo, useState } from 'react';

/** ISBN-13（978始まり）をISBN-10へ変換。それ以外はそのまま返す */
function toIsbn10(clean: string): string | undefined {
  if (/^\d{9}[\dX]$/.test(clean)) return clean; // 既にISBN-10
  if (!/^978\d{10}$/.test(clean)) return undefined; // 979始まりはISBN-10化できない
  const core = clean.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? 'X' : String(check));
}

/** Amazonの表紙画像URL（ISBN-10ベース。和書のカバー率が高く、無い場合は1x1画像が返る） */
export function amazonCoverUrl(isbn?: string): string | undefined {
  if (!isbn) return undefined;
  const i10 = toIsbn10(isbn.replace(/[-\s]/g, ''));
  return i10 ? `https://images-na.ssl-images-amazon.com/images/P/${i10}.jpg` : undefined;
}

/** 国立国会図書館サーチのサムネイルURL（Amazonに無い和書の予備） */
export function ndlThumbUrl(isbn?: string): string | undefined {
  if (!isbn) return undefined;
  const clean = isbn.replace(/[-\s]/g, '');
  if (!/^\d{10}(\d{3})?$/.test(clean)) return undefined;
  return `https://ndlsearch.ndl.go.jp/thumbnail/${clean}.jpg`;
}

function buildCandidates(coverUrl?: string, isbn?: string): string[] {
  const list: string[] = [];
  if (coverUrl) list.push(coverUrl);
  for (const url of [amazonCoverUrl(isbn), ndlThumbUrl(isbn)]) {
    if (url && !list.includes(url)) list.push(url);
  }
  return list;
}

/**
 * 保存済みcoverUrl → NDLサムネイル → 文字プレースホルダ の順に表紙を試すコンポーネント。
 * 描画時にISBNからNDL URLを導くので、coverUrl未保存の既存本にも表紙が付く。
 */
export default function BookCover({
  coverUrl,
  isbn,
  title,
  className,
  placeholderChars = 18,
}: {
  coverUrl?: string;
  isbn?: string;
  title: string;
  className?: string;
  placeholderChars?: number;
}) {
  const MAX_RETRY = 3;
  const candidates = useMemo(() => buildCandidates(coverUrl, isbn), [coverUrl, isbn]);
  const [idx, setIdx] = useState(0);
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // 対象の本が変わったら先頭候補からやり直す
  useEffect(() => {
    setIdx(0);
    setRetry(0);
  }, [candidates]);

  const base = candidates[idx];
  // 一時的なスロットリング（大量同時読み込み時など）に備え、失敗したら同じソースを再取得。
  // リトライ時はキャッシュを避けるためクエリを付与。
  const src = base
    ? retry > 0
      ? base + (base.includes('?') ? '&' : '?') + 'r=' + retry
      : base
    : undefined;

  // 候補が変わったら未読込に戻す
  useEffect(() => {
    setLoaded(false);
  }, [src]);

  const fail = () => {
    if (retry < MAX_RETRY) {
      // 指数バックオフ＋ゆらぎで再取得（同時リクエストを分散させる）
      const delay = 500 * 2 ** retry + Math.random() * 600;
      const t = setTimeout(() => setRetry((r) => r + 1), delay);
      return () => clearTimeout(t);
    }
    // リトライ尽きたら次の候補へ
    setRetry(0);
    setIdx((i) => i + 1);
  };

  // 到達不能なソースがハングしても、一定時間で失敗扱いにする（読込成功後は発火しない）
  useEffect(() => {
    if (!src || loaded) return;
    const timer = setTimeout(fail, 8000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, loaded]);

  if (!src) {
    return (
      <div className={(className ? className + ' ' : '') + 'placeholder'}>
        <span>{title.slice(0, placeholderChars)}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={title}
      className={className}
      loading="lazy"
      onError={fail}
      onLoad={(e) => {
        // 「画像なし」を1px画像で返すソース対策：極端に小さい画像は次の候補へ
        const img = e.currentTarget;
        if (img.naturalWidth > 0 && img.naturalWidth < 3) {
          setRetry(0);
          setIdx((i) => i + 1);
        } else {
          setLoaded(true);
        }
      }}
    />
  );
}
