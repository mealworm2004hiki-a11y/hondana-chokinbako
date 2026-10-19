import { useEffect, useMemo, useState } from 'react';
import { useBookActions } from '../actions';
import { useStore } from '../store';
import {
  SOURCE_LABEL,
  STATUS_LABEL,
  type Book,
  type Source,
  type Status,
} from '../types';
import BookCover from './BookCover';
import Icon from './Icon';

type SortKey =
  | 'added-desc'
  | 'added-asc'
  | 'finished-desc'
  | 'rating-desc'
  | 'rating-asc'
  | 'title'
  | 'author'
  | 'price-desc'
  | 'due-asc';

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'added-desc', label: '登録が新しい順' },
  { id: 'added-asc', label: '登録が古い順' },
  { id: 'finished-desc', label: '読了日が新しい順' },
  { id: 'rating-desc', label: '評価が高い順' },
  { id: 'rating-asc', label: '評価が低い順' },
  { id: 'title', label: 'タイトル順' },
  { id: 'author', label: '著者順' },
  { id: 'price-desc', label: '定価が高い順' },
  { id: 'due-asc', label: '返却期限が近い順' },
];

function sortBooks(books: Book[], key: SortKey): Book[] {
  const bs = [...books];
  const collator = new Intl.Collator('ja');
  switch (key) {
    case 'added-desc':
      return bs.sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
    case 'added-asc':
      return bs.sort((a, b) => (a.addedAt < b.addedAt ? -1 : 1));
    case 'finished-desc':
      return bs.sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
    case 'rating-desc':
      return bs.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    case 'rating-asc':
      return bs.sort((a, b) => (a.rating ?? 99) - (b.rating ?? 99));
    case 'title':
      return bs.sort((a, b) => collator.compare(a.title, b.title));
    case 'author':
      return bs.sort((a, b) => collator.compare(a.author ?? '', b.author ?? ''));
    case 'price-desc':
      return bs.sort((a, b) => (b.priceYen ?? -1) - (a.priceYen ?? -1));
    case 'due-asc':
      return bs.sort((a, b) =>
        (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99')
      );
  }
}

// 並び順・絞り込みはアプリを閉じても覚えておく（検索ワードは保存しない）
const PREFS_KEY = 'hondana.shelfPrefs';
interface ShelfPrefs {
  status: Status | 'all';
  source: Source | 'all';
  tag: string;
  sort: SortKey;
}
const DEFAULT_PREFS: ShelfPrefs = { status: 'all', source: 'all', tag: 'all', sort: 'rating-desc' };
function loadPrefs(): ShelfPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    return {
      ...DEFAULT_PREFS,
      ...v,
      sort: SORT_OPTIONS.some((o) => o.id === v.sort) ? v.sort : DEFAULT_PREFS.sort,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export default function Shelf() {
  const { books } = useStore();
  const { openBook } = useBookActions();
  const [prefs, setPrefs] = useState<ShelfPrefs>(loadPrefs);
  const { status, source, sort } = prefs;
  const [query, setQuery] = useState('');
  const setStatus = (v: ShelfPrefs['status']) => setPrefs((p) => ({ ...p, status: v }));
  const setSource = (v: ShelfPrefs['source']) => setPrefs((p) => ({ ...p, source: v }));
  const setTag = (v: string) => setPrefs((p) => ({ ...p, tag: v }));
  const setSort = (v: SortKey) => setPrefs((p) => ({ ...p, sort: v }));

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* 保存できなくても表示は続ける */
    }
  }, [prefs]);

  const allTags = useMemo(
    () => Array.from(new Set(books.flatMap((b) => b.tags))).sort(),
    [books]
  );
  // 保存していたタグが消えていたら「全部」として扱う
  const tag = prefs.tag === 'all' || allTags.includes(prefs.tag) ? prefs.tag : 'all';
  const filtered = status !== 'all' || source !== 'all' || tag !== 'all' || query.trim() !== '';

  const shown = useMemo(() => {
    let bs = books;
    if (status !== 'all') bs = bs.filter((b) => b.status === status);
    if (source !== 'all') bs = bs.filter((b) => b.source === source);
    if (tag !== 'all') bs = bs.filter((b) => b.tags.includes(tag));
    if (query.trim()) {
      const norm = (t: string) => t.normalize('NFKC').toLowerCase();
      const words = norm(query).split(/\s+/).filter(Boolean);
      // スペース区切りはAND検索。タイトル・著者・出版社・タグ・メモ・ISBNが対象
      bs = bs.filter((b) => {
        const hay = norm(
          [b.title, b.author, b.publisher, b.memo, b.isbn, ...b.tags].filter(Boolean).join('\n')
        );
        return words.every((w) => hay.includes(w));
      });
    }
    return sortBooks(bs, sort);
  }, [books, status, source, tag, query, sort]);

  return (
    <div className="page">
      <header className="page-header">
        <h1><Icon name="library" size={24} /> 本棚 <span className="count-badge">{shown.length}冊</span></h1>
      </header>

      <div className="shelf-controls">
        <input
          className="search-input"
          type="search"
          enterKeyHint="search"
          placeholder="タイトル・著者・タグ・メモで検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chip-row">
          {(['all', 'want', 'reading', 'done', 'tsundoku'] as const).map((s) => (
            <button
              key={s}
              className={'chip' + (status === s ? ' active' : '')}
              onClick={() => setStatus(s)}
            >
              {s === 'all' ? 'すべて' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="select-row">
          <select value={source} onChange={(e) => setSource(e.target.value as Source | 'all')}>
            <option value="all">入手方法: 全部</option>
            {(Object.keys(SOURCE_LABEL) as Source[]).map((s) => (
              <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
            ))}
          </select>
          <select value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="all">タグ: 全部</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {filtered && (
        <div className="filter-bar">
          <span>絞り込み中：{shown.length} / {books.length}冊</span>
          <button
            className="link-btn"
            onClick={() => {
              setPrefs((p) => ({ ...p, status: 'all', source: 'all', tag: 'all' }));
              setQuery('');
            }}
          >
            解除
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="empty-hint">該当する本がありません。「登録」タブから追加できます。</p>
      ) : (
        <div className="shelf-grid">
          {shown.map((b) => (
            <button key={b.id} className="shelf-item" onClick={() => openBook(b.id)}>
              <div className="shelf-cover-wrap">
                <BookCover coverUrl={b.coverUrl} isbn={b.isbn} title={b.title} className="shelf-cover" />
                {b.rating != null && (
                  <div className="rating-badge">
                    <span className="rb-star">★</span>
                    <span className="rb-num">{b.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>

              <div className="shelf-badges">
                <span className={'badge src-' + b.source}>{SOURCE_LABEL[b.source]}</span>
                <span className={'badge st-' + b.status}>{STATUS_LABEL[b.status]}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
