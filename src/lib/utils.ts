import {
	container,
	type ChatInputCommandSuccessPayload,
	Command,
	type ContextMenuCommandSuccessPayload,
	type MessageCommandSuccessPayload,
	CommandOptions,
	SapphireClient
} from '@sapphire/framework';
import { cyan } from 'colorette';
import type { APIUser, CommandInteraction, Guild, User } from 'discord.js';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

export function logSuccessCommand(payload: ContextMenuCommandSuccessPayload | ChatInputCommandSuccessPayload | MessageCommandSuccessPayload): void {
	let successLoggerData: ReturnType<typeof getSuccessLoggerData>;

	if ('interaction' in payload) {
		successLoggerData = getSuccessLoggerData(payload.interaction.guild, payload.interaction.user, payload.command);
	} else {
		successLoggerData = getSuccessLoggerData(payload.message.guild, payload.message.author, payload.command);
	}

	container.logger.debug(`${successLoggerData.shard} - ${successLoggerData.commandName} ${successLoggerData.author} ${successLoggerData.sentAt}`);
}

export function getSuccessLoggerData(guild: Guild | null, user: User, command: Command) {
	const shard = getShardInfo(guild?.shardId ?? 0);
	const commandName = getCommandInfo(command);
	const author = getAuthorInfo(user);
	const sentAt = getGuildInfo(guild);

	return { shard, commandName, author, sentAt };
}

function getShardInfo(id: number) {
	return `[${cyan(id.toString())}]`;
}

function getCommandInfo(command: Command) {
	return cyan(command.name);
}

function getAuthorInfo(author: User | APIUser) {
	return `${author.username}[${cyan(author.id)}]`;
}

function getGuildInfo(guild: Guild | null) {
	if (guild === null) return 'Direct Messages';
	return `${guild.name}[${cyan(guild.id)}]`;
}


async function fetchAllCommandsFromConvex(convex: ConvexHttpClient, serverId: string) {
	return await convex.query(anyApi.discord.getCommands, { serverId });
}

function buildHandler(blocks: any[]) {
	return async (interaction: CommandInteraction) => {
		let shouldRun = true;
		for (const block of blocks) {
			if (block.type === 'condition') {
				const { conditionType, conditionValue } = block.config;
				const input = (interaction as any).options.getString('input', false);
				if (conditionType === 'message_starts_with' && (!input || !input.startsWith(conditionValue))) {
					shouldRun = false;
				}
				// Add more conditions as needed
			}
		}
		if (!shouldRun) return;

		for (const block of blocks) {
			if (block.type === 'message') {
				await interaction.reply(block.config.content);
			}
			// Add more block types (embed, role, etc.) as needed
		}
	};
}

// Sapphire command class
class VisualCommand extends Command {
	private convex: ConvexHttpClient;
	private serverId: string;
	private commandName: string;

	constructor(context: Command.Context, options: CommandOptions, convex: ConvexHttpClient, serverId: string, commandName: string) {
		super(context, {
			...options,
			name: commandName,
			description: 'Generated from visual builder',
			
		});
		this.convex = convex;
		this.serverId = serverId;
		this.commandName = commandName;
	}

	override async chatInputRun(interaction: CommandInteraction) {
		// Fetch the command from Convex
		const commands = await fetchAllCommandsFromConvex(this.convex, this.serverId);
		console.log(commands)
		const cmd = commands.find((c: any) => c.name === this.commandName);
		if (!cmd) return;
		const handler = buildHandler(JSON.parse(cmd.blocks));
		await handler(interaction);
	}
}

async function registerAllVisualCommands(client: SapphireClient, convex: ConvexHttpClient, serverId: string) {
	const commands = await fetchAllCommandsFromConvex(convex, serverId);
	const commandStore = client.stores.get('commands');
	for (const cmd of commands) {
		const context = {
			name: cmd.name,
			path: __filename,
			root: process.cwd(),
			store: commandStore
		};
		const visualCmd = new VisualCommand(context, {}, convex, serverId, cmd.name);
		commandStore.set(visualCmd.name, visualCmd);
	}
}

export { VisualCommand, registerAllVisualCommands }; 
