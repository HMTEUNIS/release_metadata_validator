declare module 'lufs-web' {
  export function measure(input: { sampleRate: number; channels: Float32Array[] }): {
    integratedLUFS: number;
    lra: number;
    truePeakDB: number;
    truePeakLin: number;
    monoLUFS: number;
    monoDelta: number;
  };
}
