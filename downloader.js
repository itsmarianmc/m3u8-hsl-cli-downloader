const FFMPEG_PATH = 'C:\\Program Files (x86)\\Tools\\FFMPEG\\bin\\ffmpeg.exe';

const {
	spawn
} = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const axios = require('axios');

const OUTPUT_DIR = './downloads';

function ensureOutputDir() {
	if (!fs.existsSync(OUTPUT_DIR)) {
		fs.mkdirSync(OUTPUT_DIR, {
			recursive: true
		});
	}
}

function formatBytes(bytes) {
	if (bytes < 1024) return bytes.toFixed(0) + ' B';
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KiB';
	if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MiB';
	return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GiB';
}

function formatTime(seconds) {
	const hrs = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);
	return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function parseTimeToSeconds(timeStr) {
	const parts = timeStr.split(':');
	let seconds = 0;
	if (parts.length === 3) {
		seconds += parseInt(parts[0], 10) * 3600;
		seconds += parseInt(parts[1], 10) * 60;
		seconds += parseFloat(parts[2]);
	} else if (parts.length === 2) {
		seconds += parseInt(parts[0], 10) * 60;
		seconds += parseFloat(parts[1]);
	} else {
		seconds += parseFloat(parts[0]);
	}
	return seconds;
}

function formatProgress(percent, currentTime, totalTime, elapsedTime, width = 40) {
	const filled = Math.floor(width * percent / 100);
	const empty = width - filled;
	const bar = '#'.repeat(filled) + '-'.repeat(empty);
	const currentStr = formatTime(currentTime);
	const totalStr = formatTime(totalTime);
	const elapsedStr = formatTime(elapsedTime);
	return `Downloading [${bar}] ${percent.toFixed(1)}% · ${currentStr} / ${totalStr} · ${elapsedStr} elapsed`;
}

function formatLiveProgress(currentTime, fileSize) {
	const sizeStr = formatBytes(fileSize);
	return `Downloading (live) · ${formatTime(currentTime)} elapsed · ${sizeStr}`;
}

async function validateUrl(url) {
	try {
		new URL(url);
	} catch (err) {
		console.error(`Invalid URL format: ${url}`);
		return false;
	}

	try {
		const response = await axios.head(url, {
			timeout: 10000
		});
		return true;
	} catch (err) {
		if (err.response) {
			console.error(`URL responded with status ${err.response.status}: ${url}`);
		} else if (err.request) {
			console.error(`Cannot reach URL: ${url} (${err.message})`);
		} else {
			console.error(`Error validating URL: ${err.message}`);
		}
		return false;
	}
}

async function resolveFinalManifest(url) {
	const response = await axios.get(url, {
		timeout: 10000
	});
	const content = response.data;
	const lines = content.split('\n');

	let isMaster = false;
	let variantUrl = null;
	let maxBandwidth = -1;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line.startsWith('#EXT-X-STREAM-INF')) {
			isMaster = true;
			const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
			const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0;
			const nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
			if (nextLine && !nextLine.startsWith('#')) {
				if (bandwidth > maxBandwidth) {
					maxBandwidth = bandwidth;
					if (nextLine.startsWith('http')) {
						variantUrl = nextLine;
					} else {
						const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
						variantUrl = baseUrl + nextLine;
					}
				}
			}
		}
	}

	if (isMaster && variantUrl) {
		return resolveFinalManifest(variantUrl);
	}

	return {
		url,
		content,
		lines
	};
}

async function parseM3U8Info(url) {
	try {
		const {
			url: finalUrl,
			content,
			lines
		} = await resolveFinalManifest(url);
		let totalDuration = 0;
		let isLive = true;

		for (const line of lines) {
			if (line.startsWith('#EXTINF:')) {
				const duration = parseFloat(line.split(':')[1].split(',')[0]);
				if (!isNaN(duration)) totalDuration += duration;
			}
			if (line.includes('#EXT-X-ENDLIST')) {
				isLive = false;
			}
		}

		return {
			totalDuration,
			isLive,
			finalUrl
		};
	} catch (err) {
		console.warn(`Could not parse M3U8: ${err.message}. Assuming live stream.`);
		return {
			totalDuration: 0,
			isLive: true,
			finalUrl: url
		};
	}
}

async function downloadStream(finalUrl, outputPath, totalDuration, isLive, ffmpegProcRef) {
	const args = [
		'-i', finalUrl,
		'-c', 'copy',
		'-f', 'mp4',
		'-movflags', 'frag_keyframe+empty_moov',
		'-bsf:a', 'aac_adtstoasc',
		'-y',
		outputPath
	];

	const ffmpegProc = spawn(FFMPEG_PATH, args);
	ffmpegProcRef.proc = ffmpegProc;

	let lastProgressLine = '';
	let currentTime = 0;
	let lastFileSize = 0;

	const sizeInterval = setInterval(() => {
		try {
			const stats = fs.statSync(outputPath);
			lastFileSize = stats.size;
		} catch (err) {}
	}, 500);

	ffmpegProc.stderr.on('data', (data) => {
		const text = data.toString();
		const lines = text.split('\n');
		for (const line of lines) {
			let timeMatch = line.match(/time=(\d+:\d+:\d+\.\d+)/);
			if (!timeMatch) timeMatch = line.match(/out_time=(\d+:\d+:\d+\.\d+)/);
			if (timeMatch) {
				currentTime = parseTimeToSeconds(timeMatch[1]);
			}
		}
	});

	return new Promise((resolve, reject) => {
		const startTime = Date.now();
		const progressInterval = setInterval(() => {
			if (currentTime === 0) return;

			let progressLine = '';
			if (!isLive && totalDuration > 0) {
				const percent = (currentTime / totalDuration) * 100;
				const elapsedSeconds = (Date.now() - startTime) / 1000;
				progressLine = formatProgress(percent, currentTime, totalDuration, elapsedSeconds);
			} else {
				progressLine = formatLiveProgress(currentTime, lastFileSize);
			}

			if (progressLine !== lastProgressLine) {
				process.stdout.write('\r' + progressLine);
				lastProgressLine = progressLine;
			}
		}, 250);

		ffmpegProc.on('close', (code) => {
			clearInterval(progressInterval);
			clearInterval(sizeInterval);
			if (!isLive && totalDuration > 0 && currentTime >= totalDuration * 0.99) {
				process.stdout.write('\r' + formatProgress(100, totalDuration, totalDuration, (Date.now() - startTime) / 1000) + '\n');
			} else if (lastProgressLine) {
				process.stdout.write('\n');
			}
			if (code === 0) {
				console.log('Download completed successfully.');
				resolve();
			} else if (code === null || code === 255 || ffmpegProc.killed) {
				console.log('Download aborted by user.');
				resolve();
			} else {
				reject(new Error(`FFmpeg exited with code ${code}`));
			}
		});
	});
}

async function main() {
	ensureOutputDir();

	try {
		await fs.promises.access(FFMPEG_PATH, fs.constants.X_OK);
		console.log(`FFmpeg found at: ${FFMPEG_PATH}`);
	} catch (err) {
		console.error(`FFmpeg not found at: ${FFMPEG_PATH}`);
		console.error('Please check the path or install FFmpeg.');
		process.exit(1);
	}

	let url = process.argv[2];
	if (!url) {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});
		url = await new Promise((resolve) => {
			rl.question('Enter M3U8 URL: ', (answer) => {
				rl.close();
				resolve(answer.trim());
			});
		});
	}
	if (!url) {
		console.error('No URL entered. Exiting.');
		process.exit(1);
	}

	const isValid = await validateUrl(url);
	if (!isValid) {
		process.exit(1);
	}

	console.log('Analyzing M3U8...');
	const {
		totalDuration,
		isLive,
		finalUrl
	} = await parseM3U8Info(url);

	if (!isLive && totalDuration > 0) {
		console.log(`VOD stream detected. Total duration: ${formatTime(totalDuration)}`);
	} else {
		console.log('Live stream detected. Showing current duration and file size.');
	}

	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const outputFile = path.join(OUTPUT_DIR, `stream_${timestamp}.mp4`);
	console.log(`Saving as: ${outputFile}`);
	console.log('\nPress q or Ctrl+C to cancel the download safely.');

	let aborted = false;
	let ffmpegProcRef = {
		proc: null
	};

	const abortHandler = () => {
		if (aborted) return;
		aborted = true;
		console.log('\nAborting download...');
		if (ffmpegProcRef.proc && !ffmpegProcRef.proc.killed) {
			ffmpegProcRef.proc.kill('SIGINT');
		}
		setTimeout(() => {
			process.exit(0);
		}, 500);
	};

	process.removeAllListeners('SIGINT');
	process.on('SIGINT', abortHandler);

	try {
		if (process.stdin.isTTY) {
			process.stdin.resume();
			process.stdin.setEncoding('utf8');
			readline.emitKeypressEvents(process.stdin);
			process.stdin.setRawMode(true);

			const onKeypress = (str, key) => {
				if (!key) return;
				if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
					abortHandler();
				}
			};
			process.stdin.on('keypress', onKeypress);

			try {
				await downloadStream(finalUrl, outputFile, totalDuration, isLive, ffmpegProcRef);
			} finally {
				process.stdin.setRawMode(false);
				process.stdin.off('keypress', onKeypress);
				process.stdin.pause();
			}
		} else {
			await downloadStream(finalUrl, outputFile, totalDuration, isLive, ffmpegProcRef);
		}
		process.exit(0);
	} catch (err) {
		console.error(`Download failed: ${err.message}`);
		process.exit(1);
	}
}

main().catch(err => {
	console.error('Unexpected error:', err);
	process.exit(1);
});
