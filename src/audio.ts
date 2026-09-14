import { Howl, Howler } from 'howler';
import type { Settings } from './settings';

// Original synthesized sounds, distributed with the app under GPL-3.0-or-later.
// Howler handles playback, pooling, and mobile audio unlocking.
function tone(style: string): string {
  const rate = 22050, count = Math.floor(rate * .2);
  const bytes = new Uint8Array(44 + count * 2), view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const t = i / rate, fade = Math.min(1, t * 700) * Math.exp(-t * (style === 'wood' ? 45 : 23));
    const f = style === 'wood' ? 420 : style === 'bubbles' ? 650 + 2200 * t : 1046;
    const wave = Math.sin(2 * Math.PI * f * t) + .3 * Math.sin(2 * Math.PI * f * 1.5 * t);
    view.setInt16(44 + i * 2, wave * fade * 13000, true);
  }
  return 'data:audio/wav;base64,' + btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
}
const sounds = new Map<string, Howl>();
export function playSound(style: Settings['sound']) {
  if (style === 'off') return;
  try {
    let sound = sounds.get(style);
    if (!sound) { sound = new Howl({ src: [tone(style)], format: ['wav'], volume: .4 }); sounds.set(style, sound); }
    sound.play();
  } catch { /* Sound is optional. */ }
}

let voice: typeof import('mespeak')['default'] | undefined;
let loading: Promise<void> | undefined;
let speechId = 0;
let spoken: Howl | undefined;
let speechQueue = Promise.resolve();
let finishSpeech: (() => void) | undefined;
export function warmAudio() {
  try { void Howler.ctx?.resume(); } catch { /* Optional audio. */ }
  loading ??= Promise.all([import('mespeak'), import('mespeak/src/mespeak_config.json'), import('mespeak/voices/en/en-us.json')])
    .then(([module, config, english]) => {
      voice = module.default; voice.loadConfig(config.default); voice.loadVoice(english.default);
    }).catch(() => { /* Text hints remain available if speech cannot load. */ });
}
export function stopSpeech() {
  speechId++; spoken?.unload(); spoken = undefined;
  finishSpeech?.(); finishSpeech = undefined; speechQueue = Promise.resolve();
}
export function speak(message: string, queue = false) {
  if (!queue) stopSpeech();
  const id = speechId;
  speechQueue = speechQueue.then(() => say(message, id));
  return speechQueue;
}
async function say(message: string, id: number) {
  if (id !== speechId) return;
  warmAudio();
  await loading;
  if (id !== speechId || !voice) return;
  try {
    const data = voice.speak(message, { rawdata: 'data-url', speed: 145, pitch: 55 });
    if (typeof data === 'string') {
      await new Promise<void>(resolve => {
        const finish = () => { if (finishSpeech === finish) finishSpeech = undefined; resolve(); };
        finishSpeech = finish;
        spoken?.unload();
        spoken = new Howl({ src: [data], format: ['wav'], volume: .85, onend: finish, onloaderror: finish, onplayerror: finish });
        spoken.play();
      });
    }
  } catch { /* Text hints remain available if speech fails. */ }
}
