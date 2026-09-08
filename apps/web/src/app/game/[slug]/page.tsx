import { notFound } from 'next/navigation';

import { GameFrame } from '@/components/game-frame';
import { api } from '@/lib/api';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const manifest = await api.getManifest({ slug, tier: 'slice' }).catch(() => null);
  return { title: manifest ? manifest.gameSlug : 'Game' };
}

export default async function GamePage({ params }: Props) {
  const { slug } = await params;
  const manifest = await api.getManifest({ slug, tier: 'slice' }).catch(() => null);
  if (!manifest) notFound();

  // The bundle is served from the CDN and booted inside an iframe: the certified
  // game bundle is not modified, and its globals stay out of the lobby's scope.
  return <GameFrame manifest={manifest} />;
}
