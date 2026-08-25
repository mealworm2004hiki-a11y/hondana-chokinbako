export function Stars({ rating }: { rating: number }) {
  return (
    <span className="stars">
      <span className="stars-bg">★★★★★</span>
      <span className="stars-fill" style={{ width: (rating / 5) * 100 + '%' }}>
        ★★★★★
      </span>
    </span>
  );
}

export default function RatingInput({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div className="rating-input">
      <label className="rating-toggle">
        <input
          type="checkbox"
          checked={value != null}
          onChange={(e) => onChange(e.target.checked ? 3.0 : undefined)}
        />
        評価する
      </label>
      {value != null && (
        <div className="rating-slider-row">
          <input
            type="range"
            min={0}
            max={5}
            step={0.1}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <Stars rating={value} />
          <span className="rating-num">{value.toFixed(1)}</span>
        </div>
      )}
    </div>
  );
}
