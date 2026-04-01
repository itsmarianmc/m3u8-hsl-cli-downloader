# M3U8 Stream Downloader

A simple command-line tool to download M3U8 streams (VOD and live) as MP4. Built on top of [FFmpeg](https://ffmpeg.org/).

---

## Features

- Download VOD streams with a live progress bar (percentage, current time, total duration, elapsed time)
- Record live streams with real-time duration and file size display
- Automatically selects the highest quality variant from master M3U8 playlists
- Validates the URL before starting the download
- Saves output with a timestamp-based filename to avoid conflicts
- Safely abort at any time with `q` or `Ctrl+C`

---

## Requirements

Make sure the following are installed before running the script:

- [Node.js](https://nodejs.org/) (v16 or higher)
- [FFmpeg](https://ffmpeg.org/download.html)

---

## Installation

### 1. Verify Prerequisites

Install Node.js from [nodejs.org](https://nodejs.org/).
Confirm that Node.js is installed correctly. Open a terminal and run:

```bash
node -v
npm -v
```

### 2. Clone the Repository

```bash
git clone https://github.com/itsmarianmc/m3u8-stream-downloader.git
cd m3u8-stream-downloader
```

### 3. Install Dependencies

```bash
npm install axios
```

### 4. Install FFmpeg

Visit the [FFmpeg download page](https://ffmpeg.org/download.html) and download a Windows build. A reliable source is [gyan.dev](https://www.gyan.dev/ffmpeg/builds/).

Extract the archive and locate the `bin` folder inside. Place it somewhere accessible, for example:

```
C:\ffmpeg\bin\
```

The `bin` folder should contain `ffmpeg.exe`, `ffprobe.exe`, and `ffplay.exe`.

### 5. Configure FFmpeg

The script automatically detects FFmpeg in two ways — **PATH detection is recommended**:

#### Option A: Add FFmpeg to your system PATH (recommended)

Adding FFmpeg to your PATH means you never have to configure anything in the script. Here's how to do it on Windows:

1. Open the **Start Menu**, search for **"Environment Variables"** and click *"Edit the system environment variables"*
2. In the dialog that opens, click **"Environment Variables..."**
3. Under **"System variables"**, find the entry called **`Path`** and double-click it
4. Click **"New"** and add the path to FFmpeg's `bin` folder, for example:
   ```
   C:\ffmpeg\bin
   ```
5. Confirm with **OK** on all dialogs
6. **Restart your terminal** for the change to take effect

To verify it works, open a new terminal and run:

```bash
ffmpeg -version
```

If you see version information, FFmpeg is correctly on your PATH and the script will find it automatically.

#### Option B: Set the fallback path in the script

If you prefer not to modify your PATH, open `downloader.js` and update the fallback path at the top of the file:

```js
const FFMPEG_FALLBACK_PATH = 'C:\\ffmpeg\\bin\\ffmpeg.exe';
```

Make sure to use double backslashes (`\\`) in the path. This path is only used when FFmpeg is not found on the system PATH.

---

## Usage

Open a terminal in the project folder and run:

```bash
node downloader.js
```

You will be prompted to enter an M3U8 URL. Alternatively, you can pass the URL directly as an argument:

```bash
node downloader.js https://example.com/stream.m3u8
```

The script will analyze the stream and begin downloading, showing the percentage, the current of the total time/size of the file as well as the time elapsed.

For live streams, the output displays the time elapsed and current file size.

Press `q` or `Ctrl+C` at any time to abort the download safely. The partial file will be kept.

---

## License

MIT © 2026 itsmarian