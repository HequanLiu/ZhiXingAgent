// Host deployment uses the same isolated service processes and serves the built web bundle.
process.env.SOUNDLAB_SERVE_BUILD='true';
process.env.SOUNDLAB_DEMO_MODE??='false';
await import('./dev.mjs');
