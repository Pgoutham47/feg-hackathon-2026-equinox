import { notFound } from 'next/navigation';

import { GameFrame } from '@/components/game-frame';
import { bundleUrl } from '@/lib/catalogue';
import { getGame } from '@/lib/catalogue.server';

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
  return <GameFrame slug={game.slug} src={bundleUrl(game)} />;
}
