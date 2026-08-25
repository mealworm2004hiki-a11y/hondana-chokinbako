import { useStore } from '../store';
import { SOURCE_LABEL, STATUS_LABEL, today, yen, type Book } from '../types';
import BookCover from './BookCover';
import Icon from './Icon';

function daysUntil(dateIso: string): number {
  const a = new Date(today() + 'T00:00:00').getTime();
  const b = new Date(dateIso + 'T00:00:00').getTime();
  return Math.round((b - a) / 86400000);
}

export default function Home({
  onGoShelf,
  onGoAdd,
}: {
  onGoShelf: () => void;
  onGoAdd: () => void;
}) {
  const { books, savedTotal, settings, updateBook } = useStore();

  const goal = settings.goalYen ?? 0;
  const pct = goal > 0 ? Math.min(100, Math.max(0, (savedTotal / goal) * 100)) : 0;

  const dueBooks = books
    .filter((b) => b.source === 'library' && b.dueDate && !b.returned)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));

  const thisMonth = today().slice(0, 7);
  const monthDone = books.filter((b) => b.finishedAt?.startsWith(thisMonth));
  const monthSaved = monthDone.reduce((s, b) => s + (b.savedYen ?? 0), 0);

  const reading = books.filter((b) => b.status === 'reading');

  return (
    <div className="page">
      <header className="page-header">
        <h1><Icon name="piggy" size={24} /> ほんだな貯金箱</h1>
      </header>

      <section className="piggy-card">
        <div className="piggy-face"><Icon name="piggy" size={42} /></div>
        <div className="piggy-amount">{yen(savedTotal)}</div>
        <div className="piggy-sub">図書館読書で節約できた貯金</div>
        {goal > 0 ? (
          <div className="goal-block">
            <div className="goal-bar">
              <div className="goal-fill" style={{ width: pct + '%' }} />
            </div>
            <div className="goal-text">
              {settings.goalLabel || '目標'}（{yen(goal)}）まで{' '}
              {savedTotal >= goal ? '達成しました' : `あと ${yen(goal - savedTotal)}`}
              <span className="goal-pct">{Math.floor(pct)}%</span>
            </div>
          </div>
        ) : (
          <div className="goal-hint"><Icon name="settings" size={14} /> 設定タブで目標を決められます</div>
        )}
      </section>

      {dueBooks.length > 0 && (
        <section className="card">
          <h2><Icon name="bookmark" size={17} /> 返却期限</h2>
          <ul className="due-list">
            {dueBooks.map((b) => {
              const d = daysUntil(b.dueDate!);
              const cls = d < 0 ? 'overdue' : d <= 3 ? 'soon' : 'ok';
              return (
                <li key={b.id} className={'due-item ' + cls}>
                  <span className="due-title">{b.title}</span>
                  <span className="due-days">
                    {d < 0 ? `${-d}日超過！` : d === 0 ? '今日まで！' : `あと${d}日`}
                  </span>
                  <button
                    className="btn small"
                    onClick={() => updateBook(b.id, { returned: true })}
                  >
                    返却した
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="stat-row">
        <div className="mini-card">
          <div className="mini-value">{yen(monthSaved)}</div>
          <div className="mini-label"><Icon name="coins" size={13} />今月の貯金</div>
        </div>
        <div className="mini-card">
          <div className="mini-value">{monthDone.length}<span>冊</span></div>
          <div className="mini-label"><Icon name="bookCheck" size={13} />今月の読了</div>
        </div>
      </section>

      <section className="card">
        <h2><Icon name="book" size={17} /> いま読んでる本</h2>
        {reading.length === 0 ? (
          <p className="empty-hint">
            読んでいる本はありません。
            <button className="link-btn" onClick={onGoAdd}>
              本を登録する →
            </button>
          </p>
        ) : (
          <div className="cover-strip" onClick={onGoShelf}>
            {reading.map((b: Book) => (
              <div key={b.id} className="strip-item">
                <BookCover coverUrl={b.coverUrl} isbn={b.isbn} title={b.title} className="strip-cover" placeholderChars={12} />
                <div className="strip-meta">
                  {SOURCE_LABEL[b.source]}・{STATUS_LABEL[b.status]}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
