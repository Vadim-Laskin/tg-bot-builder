import { useEffect, useRef, useState } from 'react';

// Animated Telegram sticker (.tgs = gzipped Lottie JSON).
// Drop the file into public/stickers/ (default: welcome.tgs). A plain
// Lottie .json works too. If the file is missing or can't be played, a
// static emoji is shown instead, so the screen never looks broken.

async function loadAnimationData(src) {
  const res = await fetch(src);
  if (!res.ok) throw new Error('sticker not found');
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip) return JSON.parse(new TextDecoder().decode(bytes));
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

export default function TgsSticker({ src = '/stickers/welcome.tgs', size = 180, fallback = '🦄' }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let anim;
    let cancelled = false;
    setFailed(false);
    (async () => {
      try {
        const [{ default: lottie }, data] = await Promise.all([
          import('lottie-web/build/player/lottie_light'),
          loadAnimationData(src)
        ]);
        if (cancelled || !ref.current) return;
        anim = lottie.loadAnimation({
          container: ref.current,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData: data
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      anim?.destroy();
    };
  }, [src]);

  if (failed) {
    return (
      <div className="sticker sticker--fallback" style={{ width: size, height: size, fontSize: size * 0.7 }}>
        {fallback}
      </div>
    );
  }
  return <div className="sticker" ref={ref} style={{ width: size, height: size }} aria-hidden="true" />;
}
