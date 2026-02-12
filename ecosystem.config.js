export default {
  apps: [
    {
      name: "pushlog",
      script: "./dist/index.js",
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
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: "10s",
    },
    {
      name: "streaming-stats",
      script: "./target/release/streaming-stats",
      cwd: ".",
      instances: 1,
      autorestart: true,
      env: {
        PORT: "5004",
      },
      env_file: ".env",
      error_file: "./logs/stats-err.log",
      out_file: "./logs/stats-out.log",
    },
  ],
};
