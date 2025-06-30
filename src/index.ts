import './lib/setup';

import { LogLevel, SapphireClient } from '@sapphire/framework';
import { GatewayIntentBits } from 'discord.js';
import { registerAllVisualCommands } from './lib/utils';
import { ConvexHttpClient } from 'convex/browser';

import 'dotenv/config'

const client = new SapphireClient({
	defaultPrefix: '!',
	caseInsensitiveCommands: true,
	logger: {
		level: LogLevel.Debug
	},
	intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessages, GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent],
	loadMessageCommandListeners: true
});

const main = async () => {
	const convex = new ConvexHttpClient(process.env.CONVEX_URL!);
	await registerAllVisualCommands(client, convex, '1168532822563233847');
	try {
		client.logger.info('Logging in');
		await client.login();
		client.logger.info('logged in');
	} catch (error) {
		client.logger.fatal(error);
		await client.destroy();
		process.exit(1);
	}
};

void main();
