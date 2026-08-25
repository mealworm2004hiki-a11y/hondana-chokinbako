import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

export default function Scanner({
  onDetect,
  onClose,
}: {
  onDetect: (isbn: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const detectedRef = useRef(false);

  useEffect(() => {
    // 書籍バーコード（EAN-13）に絞り、多少ぶれても読めるようにする
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints);

    let controls: IScannerControls | undefined;
    let cancelled = false;

    const handle = (text: string) => {
      // 日本の書籍は上=ISBN(978/979始まり)・下=価格(192始まり)の2段。ISBNのみ受け付ける
      if (detectedRef.current) return;
      if (/^97[89]\d{10}$/.test(text)) {
        detectedRef.current = true;
        controls?.stop();
        onDetect(text);
      }
    };

    reader
      // 背面カメラ（environment）を明示指定。前面カメラが起動する問題を防ぐ
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current!,
        (result) => {
          if (result) handle(result.getText());
        }
      )
      .then((c) => {
        if (cancelled) c.stop();
        else controls = c;
      })
      .catch((e) => {
        const name = (e && (e.name as string)) || '';
        if (name === 'NotAllowedError') {
          setError('カメラの使用が許可されていません。ブラウザの設定でカメラを許可するか、下でISBNを手入力してください。');
        } else if (name === 'NotFoundError') {
          setError('使えるカメラが見つかりませんでした。ISBNを手入力してください。');
        } else {
          setError('カメラを起動できませんでした。ページを再読み込みするか、ISBNを手入力してください。');
        }
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onDetect]);

  return (
    <div className="scanner">
      {error ? (
        <p className="scanner-error">{error}</p>
      ) : (
        <>
          <div className="scanner-frame">
            <video ref={videoRef} className="scanner-video" muted playsInline autoPlay />
            <div className="scanner-reticle" />
          </div>
          <p className="scanner-hint">
            本の裏表紙、<strong>上のバーコード（978で始まる方）</strong>を枠に合わせてください
          </p>
        </>
      )}
      <button className="btn wide" onClick={onClose}>スキャンをやめる</button>
    </div>
  );
}
