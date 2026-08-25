export interface BookInfo {
  isbn: string;
  title: string;
  author?: string;
  publisher?: string;
  coverUrl?: string;
  priceYen?: number;
  pageCount?: number;
}

/** ONIX形式の著者名（"夏目,漱石,1867-1916"など）を読みやすく整える */
function normalizeAuthor(raw: string): string {
  return raw
    .split(/[;／]/)
    .map((a) =>
      a
        .replace(/,?\s*\d{4}\s*-\s*(\d{4})?/g, '')
        .replace(/,/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .join('、');
}

/** openBD → Google Books の順に書誌情報を引く */
export async function lookupIsbn(isbn: string): Promise<BookInfo | null> {
  const info: Partial<BookInfo> = { isbn };

  try {
    const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${encodeURIComponent(isbn)}`);
    const [data] = await res.json();
    if (data) {
      const s = data.summary ?? {};
      if (s.title) info.title = s.title;
      if (s.author) info.author = normalizeAuthor(s.author);
      if (s.publisher) info.publisher = s.publisher;
      if (s.cover) info.coverUrl = s.cover;

      const prices = data.onix?.ProductSupply?.SupplyDetail?.Price;
      if (Array.isArray(prices) && prices[0]?.PriceAmount) {
        const p = Number(prices[0].PriceAmount);
        if (Number.isFinite(p) && p > 0) info.priceYen = p;
      }
      const extents = data.onix?.DescriptiveDetail?.Extent;
      if (Array.isArray(extents)) {
        const pages = extents.find((e: { ExtentType?: string }) => e.ExtentType === '11' || e.ExtentType === '00');
        if (pages?.ExtentValue) {
          const n = Number(pages.ExtentValue);
          if (Number.isFinite(n) && n > 0) info.pageCount = n;
        }
      }
    }
  } catch {
    // openBD失敗時はGoogle Booksへ
  }

  if (!info.title || !info.coverUrl || !info.pageCount) {
    try {
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`);
      const data = await res.json();
      const v = data.items?.[0]?.volumeInfo;
      if (v) {
        if (!info.title && v.title) info.title = v.title;
        if (!info.author && v.authors) info.author = v.authors.join('、');
        if (!info.publisher && v.publisher) info.publisher = v.publisher;
        if (!info.pageCount && v.pageCount) info.pageCount = v.pageCount;
        if (!info.coverUrl && v.imageLinks?.thumbnail) {
          info.coverUrl = String(v.imageLinks.thumbnail).replace('http://', 'https://');
        }
      }
    } catch {
      // 両方失敗なら手入力へフォールバック
    }
  }

  return info.title ? (info as BookInfo) : null;
}

/** Google Booksの1件からBookInfoを組み立てる（ISBN-13優先） */
function fromGoogleVolume(item: {
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publisher?: string;
    pageCount?: number;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    industryIdentifiers?: { type?: string; identifier?: string }[];
  };
}): BookInfo | null {
  const v = item.volumeInfo;
  if (!v?.title) return null;
  const ids = v.industryIdentifiers ?? [];
  const isbn13 = ids.find((i) => i.type === 'ISBN_13')?.identifier;
  const isbn10 = ids.find((i) => i.type === 'ISBN_10')?.identifier;
  const isbn = (isbn13 ?? isbn10 ?? '').replace(/[-\s]/g, '');
  const thumb = v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail;
  return {
    isbn,
    title: v.title,
    author: v.authors?.join('、'),
    publisher: v.publisher,
    pageCount: v.pageCount,
    coverUrl: thumb ? String(thumb).replace('http://', 'https://') : undefined,
  };
}

/** Google Booksをキーワード検索（クリーンな結果・書影・ページ数が得られる） */
async function searchGoogle(q: string): Promise<BookInfo[]> {
  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=20&langRestrict=ja`
  );
  if (!res.ok) throw new Error('google ' + res.status);
  const data = await res.json();
  const items: unknown[] = Array.isArray(data.items) ? data.items : [];
  const out: BookInfo[] = [];
  for (const it of items) {
    const info = fromGoogleVolume(it as Parameters<typeof fromGoogleVolume>[0]);
    if (info) out.push(info);
  }
  return out;
}

/** NDL（国立国会図書館サーチ）の著者表記を読みやすく整える */
function cleanNdlAuthor(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !/^\d{4}(-\d{0,4})?$/.test(s));
  const disp = parts.find((s) => /著|編|作|訳/.test(s)) ?? parts[0] ?? '';
  return disp.replace(/\s*(著|編|作|訳|ほか)\s*$/, '').trim() || undefined;
}

/** 国立国会図書館サーチをタイトル検索（GoogleがダメなときのフォールバックかつJP強い） */
async function searchNdl(q: string): Promise<BookInfo[]> {
  const res = await fetch(
    `https://ndlsearch.ndl.go.jp/api/opensearch?title=${encodeURIComponent(q)}&cnt=30`
  );
  if (!res.ok) throw new Error('ndl ' + res.status);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const out: BookInfo[] = [];
  for (const it of Array.from(doc.querySelectorAll('item'))) {
    const cats = Array.from(it.getElementsByTagName('category')).map((c) => c.textContent);
    if (!cats.includes('図書')) continue; // 記事・雑誌などを除外
    let isbn = '';
    for (const e of Array.from(it.getElementsByTagName('dc:identifier'))) {
      if (e.getAttribute('xsi:type') === 'dcndl:ISBN') isbn = (e.textContent ?? '').replace(/[-\s]/g, '');
    }
    if (!/^97[89]\d{10}$/.test(isbn)) continue; // ISBN-13を持つ図書のみ
    const title = it.getElementsByTagName('dc:title')[0]?.textContent;
    if (!title) continue;
    out.push({
      isbn,
      title,
      author: cleanNdlAuthor(it.getElementsByTagName('author')[0]?.textContent),
      publisher: it.getElementsByTagName('dc:publisher')[0]?.textContent ?? undefined,
    });
  }
  return out;
}

/** タイトル・著者などのキーワードで書籍を検索。Google Books優先、失敗時はNDLへ */
export async function searchBooks(query: string): Promise<BookInfo[]> {
  const q = query.trim();
  if (!q) return [];

  let results: BookInfo[] = [];
  try {
    results = await searchGoogle(q);
  } catch {
    results = [];
  }
  if (results.length === 0) {
    try {
      results = await searchNdl(q);
    } catch {
      results = [];
    }
  }

  // ISBN（無ければタイトル＋著者）で重複を除去
  const seen = new Set<string>();
  const out: BookInfo[] = [];
  for (const info of results) {
    const key = info.isbn || info.title + (info.author ?? '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(info);
  }
  return out;
}
