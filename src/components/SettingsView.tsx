import { useRef, useState } from 'react';
import { useStore } from '../store';
import {
  today,
  uid,
  yen,
  type BackupData,
  type Book,
  type Source,
  type Status,
} from '../types';
import Icon from './Icon';

// ---- CSVユーティリティ ----

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuote = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === ',') {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

async function readCsvFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (!utf8.includes('�')) return utf8;
  try {
    return new TextDecoder('shift_jis').decode(buf);
  } catch {
    return utf8;
  }
}

type CsvField = 'skip' | 'title' | 'author' | 'isbn' | 'rating' | 'status' | 'finishedAt' | 'memo' | 'tags' | 'price';

const FIELD_LABEL: Record<CsvField, string> = {
  skip: '（使わない）',
  title: 'タイトル',
  author: '著者',
  isbn: 'ISBN',
  rating: '評価',
  status: 'ステータス',
  finishedAt: '読了日',
  memo: '感想メモ',
  tags: 'タグ',
  price: '定価',
};

function guessField(header: string): CsvField {
  const h = header.toLowerCase();
  if (/isbn/.test(h)) return 'isbn';
  if (/タイトル|書名|title/.test(h)) return 'title';
  if (/著者|作者|author/.test(h)) return 'author';
  if (/評価|星|rating/.test(h)) return 'rating';
  if (/状態|ステータス|status/.test(h)) return 'status';
  if (/読了|読み終|finish/.test(h)) return 'finishedAt';
  if (/感想|メモ|レビュー|コメント|memo|review/.test(h)) return 'memo';
  if (/タグ|カテゴリ|tag/.test(h)) return 'tags';
  if (/定価|価格|金額|price/.test(h)) return 'price';
  return 'skip';
}

function parseStatus(v: string): Status | undefined {
  if (/読み終|読了|済/.test(v)) return 'done';
  if (/いま読ん|読んでる|読書中/.test(v)) return 'reading';
  if (/積読|積ん読/.test(v)) return 'tsundoku';
  if (/読みたい/.test(v)) return 'want';
  return undefined;
}

function parseDate(v: string): string | undefined {
  const m = v.match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
  if (!m) return undefined;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

// ---- 画面 ----

export default function SettingsView() {
  const store = useStore();
  const { settings, setSettings, withdrawals, savedTotal, books } = store;

  const [wAmount, setWAmount] = useState('');
  const [wNote, setWNote] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const jsonInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // CSVインポートの作業状態
  const [csvRows, setCsvRows] = useState<string[][] | null>(null);
  const [csvMap, setCsvMap] = useState<CsvField[]>([]);
  const [csvSource, setCsvSource] = useState<Source>('purchased');
  const [csvCountSavings, setCsvCountSavings] = useState(false);

  const withdraw = () => {
    const amount = Number(wAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    store.addWithdrawal({ id: uid(), amountYen: amount, note: wNote.trim() || 'ご褒美', date: today() });
    setWAmount('');
    setWNote('');
  };

  const exportJson = () => {
    const data: BackupData = {
      app: 'hondana-chokinbako',
      exportedAt: new Date().toISOString(),
      books: store.books,
      withdrawals: store.withdrawals,
      settings: store.settings,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hondana-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as BackupData;
      if (!Array.isArray(data.books)) throw new Error('bad format');
      if (confirm(`バックアップ（本 ${data.books.length}冊）で現在のデータを置き換えますか？\nこの操作は元に戻せません。`)) {
        store.replaceAll(data);
        setNotice('バックアップを読み込みました');
      }
    } catch {
      setNotice('バックアップファイルを読み込めませんでした');
    }
  };

  const loadCsv = async (file: File) => {
    const text = await readCsvFile(file);
    const rows = parseCsv(text);
    if (rows.length < 2) {
      setNotice('CSVにデータ行がありません');
      return;
    }
    setCsvRows(rows);
    setCsvMap(rows[0].map(guessField));
    setNotice(null);
  };

  const runCsvImport = () => {
    if (!csvRows) return;
    const [, ...dataRows] = csvRows;
    const newBooks: Book[] = [];
    for (const row of dataRows) {
      const get = (f: CsvField) => {
        const idx = csvMap.indexOf(f);
        return idx >= 0 ? (row[idx] ?? '').trim() : '';
      };
      const title = get('title');
      if (!title) continue;
      const status = parseStatus(get('status')) ?? 'done';
      const finishedAt = parseDate(get('finishedAt'));
      const ratingRaw = Number(get('rating'));
      const priceRaw = Number(get('price').replace(/[¥,円]/g, ''));
      const priceYen = Number.isFinite(priceRaw) && priceRaw > 0 ? priceRaw : undefined;
      const savedYen =
        csvCountSavings && csvSource === 'library' && status === 'done' && priceYen
          ? Math.round(priceYen * 1.1)
          : undefined;
      newBooks.push({
        id: uid(),
        title,
        author: get('author') || undefined,
        isbn: get('isbn').replace(/[-\s]/g, '') || undefined,
        rating: Number.isFinite(ratingRaw) && ratingRaw > 0 ? Math.min(5, ratingRaw) : undefined,
        status,
        source: csvSource,
        memo: get('memo') || undefined,
        tags: get('tags').split(/[,、，/]/).map((t) => t.trim()).filter(Boolean),
        addedAt: finishedAt ?? today(),
        finishedAt: status === 'done' ? finishedAt ?? today() : undefined,
        priceYen,
        savedYen,
      });
    }
    store.addBooks(newBooks);
    setCsvRows(null);
    setNotice(`${newBooks.length}冊をインポートしました`);
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1><Icon name="settings" size={24} /> 設定</h1>
      </header>

      {notice && <p className="notice">{notice}</p>}

      <section className="card">
        <h2>🎯 貯金の目標</h2>
        <label className="field">
          <span>目標の名前</span>
          <input
            value={settings.goalLabel ?? ''}
            placeholder="例: 温泉旅行"
            onChange={(e) => setSettings({ goalLabel: e.target.value })}
          />
        </label>
        <label className="field">
          <span>目標金額（円）</span>
          <input
            type="number"
            inputMode="numeric"
            value={settings.goalYen ?? ''}
            placeholder="例: 30000"
            onChange={(e) =>
              setSettings({ goalYen: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
        </label>
      </section>

      <section className="card">
        <h2><Icon name="coins" size={17} /> 取り崩し</h2>
        <p className="sub-note">現在の貯金: <strong>{yen(savedTotal)}</strong></p>
        <div className="field-row">
          <label className="field">
            <span>金額（円）</span>
            <input type="number" inputMode="numeric" value={wAmount} onChange={(e) => setWAmount(e.target.value)} />
          </label>
          <label className="field">
            <span>使いみち</span>
            <input value={wNote} placeholder="例: ケーキ" onChange={(e) => setWNote(e.target.value)} />
          </label>
        </div>
        <button className="btn primary" onClick={withdraw} disabled={!wAmount}>
          取り崩す
        </button>
        {withdrawals.length > 0 && (
          <ul className="withdraw-list">
            {withdrawals.map((w) => (
              <li key={w.id}>
                <span>{w.date} {w.note}</span>
                <span className="withdraw-amount">-{yen(w.amountYen)}</span>
                <button className="icon-btn" onClick={() => store.deleteWithdrawal(w.id)}>✕</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>💾 バックアップ</h2>
        <div className="btn-row">
          <button className="btn" onClick={exportJson}>JSONエクスポート</button>
          <button className="btn" onClick={() => jsonInputRef.current?.click()}>JSONインポート</button>
        </div>
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importJson(f);
            e.target.value = '';
          }}
        />
        <p className="sub-note">データはこの端末の中だけに保存されます。定期的にエクスポートしておくと安心です。</p>
      </section>

      <section className="card">
        <h2>📥 CSVインポート</h2>
        <p className="sub-note">ブクログや読書貯金からエクスポートしたCSVを取り込めます。</p>
        <button className="btn" onClick={() => csvInputRef.current?.click()}>CSVファイルを選ぶ</button>
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) loadCsv(f);
            e.target.value = '';
          }}
        />
        {csvRows && (
          <div className="csv-mapper">
            <p className="sub-note">
              {csvRows.length - 1}行を検出。各列をどの項目として取り込むか確認してください。
            </p>
            {csvRows[0].map((header, i) => (
              <div className="csv-col-row" key={i}>
                <span className="csv-header" title={csvRows[1]?.[i] ?? ''}>
                  {header || `列${i + 1}`}
                  <small>例: {(csvRows[1]?.[i] ?? '').slice(0, 16)}</small>
                </span>
                <select
                  value={csvMap[i]}
                  onChange={(e) =>
                    setCsvMap((m) => m.map((v, j) => (j === i ? (e.target.value as CsvField) : v)))
                  }
                >
                  {(Object.keys(FIELD_LABEL) as CsvField[]).map((f) => (
                    <option key={f} value={f}>{FIELD_LABEL[f]}</option>
                  ))}
                </select>
              </div>
            ))}
            <label className="field">
              <span>入手方法として登録</span>
              <select value={csvSource} onChange={(e) => setCsvSource(e.target.value as Source)}>
                <option value="purchased">購入</option>
                <option value="owned">所有</option>
                <option value="library">図書館</option>
              </select>
            </label>
            {csvSource === 'library' && (
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={csvCountSavings}
                  onChange={(e) => setCsvCountSavings(e.target.checked)}
                />
                読了済みの本は貯金にも計上する（定価列が必要）
              </label>
            )}
            <div className="btn-row">
              <button className="btn" onClick={() => setCsvRows(null)}>キャンセル</button>
              <button className="btn primary" onClick={runCsvImport}>インポート実行</button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2><Icon name="info" size={17} /> このアプリ</h2>
        <p className="sub-note">
          ほんだな貯金箱 v1.0 — 図書館で借りて読了した本の税込定価が貯金になる、本棚×貯金箱アプリ。
          登録冊数: {books.length}冊
        </p>
      </section>
    </div>
  );
}
