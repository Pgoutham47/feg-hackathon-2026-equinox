import { Dashboard } from '@/components/dashboard/dashboard';
import { getArt, getCatalogue } from '@/lib/catalogue.server';

export default async function LobbyPage() {
  // Still read on the server, and the grid still renders in the HTML: the
  // prefetch has to be able to start before hydration, which is most of the win.
  const { games, bundleVersion } = await getCatalogue();
  const art = await getArt();

  return <Dashboard games={games} art={art} bundleVersion={bundleVersion} />;
}
