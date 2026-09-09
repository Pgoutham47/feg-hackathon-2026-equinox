import { type AudioFormat } from '@/lib/catalogue';

/**
 * Mirrors Howler's own format choice.
 *
 * The engine builds every sound as `new Howl({ src: [ogg, mp3] })`, and Howler
 * walks that list taking the first entry whose extension the browser reports it
 * can decode — `canPlayType('audio/ogg; codecs="vorbis"')` for ogg. So Chrome,
 * Firefox and Edge take the ogg; Safari and iOS fall through to the mp3.
 *
 * This runs the same test rather than a user-agent lookalike, for the same
 * reason `detectTier` uses the engine's own library: the only thing that
 * matters is that the two agree. Prefetching ogg for a browser that will ask
 * for mp3 is worse than not prefetching at all — here it would spend 4.7 MB of
 * a player's bandwidth on a file nothing ever decodes.
 */
export function detectAudioFormat(): AudioFormat {
  const probe = document.createElement('audio');
  // canPlayType returns '', 'maybe' or 'probably'; Howler treats anything but
  // the empty string (and the literal 'no' some old browsers returned) as yes.
  const ogg = probe.canPlayType('audio/ogg; codecs="vorbis"').replace(/^no$/, '');
  return ogg ? 'ogg' : 'mp3';
}
