# Spatium Discord Bot

A companion Discord bot for the [Spatium Minecraft plugin](https://github.com/Bluejutzu/spatium-server). It handles features like account linking and server integration.

## Features

- 🔗 Link Discord accounts with Minecraft players
- 📡 Postgres and Redis integration for fast communication

## Related Projects

- 🟩 Minecraft Plugin: [spatium-server](https://github.com/Bluejutzu/spatium-server)

## Requirements

- Node.js 18+
- Discord Bot Token
- Redis instance
- (Optional) PostgreSQL if needed for advanced features

## Getting Started

1. Clone this repository:
   ```bash
   git clone https://github.com/Bluejutzu/spatium-bot.git
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variable in a `.env` file
   ```env
   DISCORD_TOKEN=your_token_here
   REDIS_URL=your_redis_url
   ```
4. Run the bot:
   ```bash
   # npm
   npm run start

## License
This project is open source and available under the [MIT License](License).

   # pnpm
   pnpm start
   ```
