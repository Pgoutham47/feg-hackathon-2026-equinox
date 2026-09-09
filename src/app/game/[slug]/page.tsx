import { notFound } from 'next/navigation';

import { GameFrame } from '@/components/game-frame';
import { assetUrl } from '@/lib/catalogue';
import { getCatalogue, getGame } from '@/lib/catalogue.server';
import { copyFor, copyVersion } from '@/lib/copies';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const game = await getGame((await params).slug);
  return { title: game?.name ?? 'Game' };
}

export default async function GamePage({ params }: Props) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) notFound();

  // The certified bundle boots inside an iframe, unmodified, on the lobby's own
  // origin — the only origin the service worker is able to serve it from.
  //
  // Which copy it boots from is decided here rather than in the browser: the
  // favourites are a fixed list, so the server knows it, and the iframe can
  // start loading from the HTML instead of waiting a tick for hydration.
  const { bundleVersion } = await getCatalogue();
  const copy = copyFor(game.slug);
  return (
    <GameFrame slug={game.slug} src={assetUrl(copyVersion(bundleVersion, copy), 'index.html')} />
  );
}
