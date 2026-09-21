class SoundManager {
  private audioContext: AudioContext | null = null;

  private initContext() {
    try {
      if (!this.audioContext) {
        const AudioContextClass =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioContext = new AudioContextClass();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
    } catch (e) {
      console.warn('AudioContext init failed', e);
    }
  }

  speak(text: string) {
    console.log('Audio Message: ', text);
  }

  playSuccess() {
    try {
      this.initContext();
      if (!this.audioContext) return;
      const ctx = this.audioContext;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.type = 'sine';
      osc2.type = 'triangle';

      osc1.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc2.frequency.setValueAtTime(523.25, ctx.currentTime);

      osc1.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);

      osc1.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2);
      osc2.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2);

      osc1.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.35);
      osc2.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.35);

      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.05);
      gainNode.gain.setValueAtTime(0.08, ctx.currentTime + 0.35);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);

      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 1.2);
      osc2.stop(ctx.currentTime + 1.2);
    } catch (e) {
      console.warn('playSuccess failed', e);
    }
  }

  playError() {
    try {
      this.initContext();
      if (!this.audioContext) return;
      const ctx = this.audioContext;

      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.type = 'sawtooth';

      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.2);
      osc.frequency.setValueAtTime(120, ctx.currentTime + 0.25);
      osc.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.6);

      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.05);
      gainNode.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      gainNode.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.25);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    } catch (e) {
      console.warn('playError failed', e);
    }
  }

  playClick() {
    try {
      this.initContext();
      if (!this.audioContext) return;
      const ctx = this.audioContext;
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.05);

      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.05);
    } catch (e) {
      console.warn('playClick failed', e);
    }
  }
}

export const soundManager = new SoundManager();

declare global {
  interface Window {
    soundManager?: SoundManager;
  }
}
