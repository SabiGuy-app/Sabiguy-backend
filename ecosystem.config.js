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
      error_file: "./logs/api-error.log",
      out_file: "./logs/api-out.log",
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
      error_file: "./logs/cron-error.log",
      out_file: "./logs/cron-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      autorestart: false,
      watch: false,
      max_memory_restart: "512M",
    },
  ],
};
