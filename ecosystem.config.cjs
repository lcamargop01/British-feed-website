module.exports = {
  apps: [
    {
      name: 'british-feed',
      script: 'npx',
      args: 'wrangler pages dev dist --ip 0.0.0.0 --port 3000',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
        OPENAI_BASE_URL: 'https://www.genspark.ai/api/llm_proxy/v1'
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
