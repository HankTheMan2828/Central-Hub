/* AudioWorkletProcessor for STT capture.
 * Batches microphone frames before posting them to the main thread. Posting
 * every 128-frame render quantum can overwhelm the renderer and make the app
 * feel frozen while recording.
 */
class STTRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(8192);
    this.count = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel || channel.length === 0) return true;

    if (this.count + channel.length > this.buffer.length) {
      this.flush();
    }
    this.buffer.set(channel, this.count);
    this.count += channel.length;

    if (this.count >= this.buffer.length) {
      this.flush();
    }

    return true;
  }

  flush() {
    if (this.count === 0) return;
    const copy = new Float32Array(this.count);
    copy.set(this.buffer.subarray(0, this.count));
    this.count = 0;
    this.port.postMessage(copy, [copy.buffer]);
  }
}

registerProcessor("stt-recorder", STTRecorderProcessor);
