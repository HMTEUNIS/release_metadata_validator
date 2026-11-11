import { analyzeChannels } from './analyzeBuffer';

addEventListener('message', (event: MessageEvent<{ sampleRate: number; channels: Float32Array[] }>) => {
  const { sampleRate, channels } = event.data;
  postMessage(analyzeChannels(sampleRate, channels));
});
