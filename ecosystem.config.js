module.exports = {
  apps: [
    {
      name: "pushlog",
      script: "./server/index.js",
      instances: 1,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 5001,
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_file: "./logs/combined.log",
      time: true,
      // Auto-restart on crash
      autorestart: true,
      // Watch for file changes (disable in production)
      watch: false,
      // Max memory usage before restart
      max_memory_restart: "1G",
      // Restart delay
      restart_delay: 4000,
      // Max restarts per day
      max_restarts: 10,
      // Min uptime before considering stable
      min_uptime: "10s",
    },
  ],
};
