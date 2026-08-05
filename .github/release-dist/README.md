# Thoth Blueprint

Thoth Blueprint is a browser-based database diagram editor. This package is the
complete production build and does not require Node.js, npm, pnpm, or
`node_modules`.

## Run Thoth Blueprint

1. Extract this ZIP archive.
2. Open a terminal in the extracted folder.
3. Start a local web server:

   ```bash
   python -m http.server 8080
   ```

4. Open [http://localhost:8080](http://localhost:8080) in your browser.

Keep the terminal open while starting the application for the first time.

## Offline Usage

After the application loads successfully, its service worker caches the
application files. You can close the terminal and continue using Thoth
Blueprint offline. After the initial load, the cached application may also
open again while the server is stopped.

For the most reliable access, use the same browser and port:

```text
http://localhost:8080
```

The application stores diagrams and settings in your browser's local
IndexedDB storage. Clearing browser data can remove those diagrams and the
cached application.

AI features that use external providers require network access. Local AI
providers require their own local service to be running.

## Stop the Server

Return to the terminal and press `Ctrl+C`.
