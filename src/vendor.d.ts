declare module 'mespeak' {
  const meSpeak: {
    loadConfig(data: unknown): void;
    loadVoice(data: unknown): void;
    speak(message: string, options: { rawdata: string; speed: number; pitch: number }): string | null;
  };
  export default meSpeak;
}
declare module 'mespeak/**/*.json' { const data: unknown; export default data; }
declare const __COMMIT__: string;
declare const __COMMIT_URL__: string;
