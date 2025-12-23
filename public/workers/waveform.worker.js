/**
 * Web Worker for calculating waveform peaks off the main thread.
 *
 * Message format:
 * { type: 'calculate', channelData: Float32Array, targetPeaks: number }
 *
 * Response format:
 * { type: 'result', peaks: number[] }
 * { type: 'error', message: string }
 */

self.onmessage = function (e) {
	const { type, channelData, targetPeaks } = e.data;

	if (type !== "calculate") {
		self.postMessage({ type: "error", message: "Unknown message type" });
		return;
	}

	try {
		const peaks = calculatePeaks(channelData, targetPeaks);
		self.postMessage({ type: "result", peaks });
	} catch (error) {
		self.postMessage({
			type: "error",
			message: error instanceof Error ? error.message : "Unknown error",
		});
	}
};

function calculatePeaks(channelData, targetPeaks) {
	const samplesPerPeak = Math.floor(channelData.length / targetPeaks);
	const peaks = [];

	for (let i = 0; i < targetPeaks; i++) {
		const start = i * samplesPerPeak;
		const end = Math.min(start + samplesPerPeak, channelData.length);

		let max = 0;
		for (let j = start; j < end; j++) {
			const value = Math.abs(channelData[j]);
			if (value > max) max = value;
		}

		peaks.push(max);
	}

	return peaks;
}
