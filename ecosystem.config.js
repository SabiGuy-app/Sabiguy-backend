module.exports = {
  apps: [
    {
      name: "sabiguy-api",
      script: "./index.js",
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    },
    {
      name: "sabiguy-cron",
      script: "./cron/cronJobs.js",
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      autorestart: false,
      watch: false,
      max_memory_restart: "512M",
    },
  ],
};