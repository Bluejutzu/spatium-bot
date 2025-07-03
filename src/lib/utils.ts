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
import {
	APIUser,
	Guild,
	User,
	ActionRowBuilder,
	ButtonBuilder,
	StringSelectMenuBuilder,
	ButtonStyle,
	ChatInputCommandInteraction
} from 'discord.js';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

// Existing utility functions
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

// Enhanced command fetching
async function fetchAllCommandsFromConvex(convex: ConvexHttpClient, serverId: string) {
	try {
		return await convex.query(anyApi.discord.getCommands, { serverId });
	} catch (error) {
		container.logger.error('Failed to fetch commands from Convex:', error);
		return [];
	}
}

// --- Node/Edge Types for Visual Command System ---
export interface VisualNode {
	id: string;
	type: string;
	position: { x: number; y: number };
	data: {
		label: string;
		type: string;
		config: any;
	};
	draggable?: boolean;
}

export interface VisualEdge {
	id: string;
	source: string;
	target: string;
	sourceHandle?: string;
	targetHandle?: string;
	type?: string;
}

// Add a local buildComponents function for Discord.js components
function buildComponents(components: any[]): ActionRowBuilder<any>[] {
	const rows: ActionRowBuilder<any>[] = [];
	let currentRow = new ActionRowBuilder();
	let componentsInRow = 0;

	for (const component of components) {
		if (componentsInRow >= 5) {
			rows.push(currentRow);
			currentRow = new ActionRowBuilder();
			componentsInRow = 0;
		}

		if (component.type === 'button') {
			const button = new ButtonBuilder()
				.setCustomId(component.custom_id)
				.setLabel(component.label)
				.setStyle(component.style || ButtonStyle.Primary);

			if (component.emoji) button.setEmoji(component.emoji);
			if (component.disabled) button.setDisabled(true);

			currentRow.addComponents(button);
			componentsInRow++;
		} else if (component.type === 'select') {
			const selectMenu = new StringSelectMenuBuilder()
				.setCustomId(component.custom_id)
				.setPlaceholder(component.placeholder || 'Select an option');

			if (component.options && Array.isArray(component.options)) {
				selectMenu.addOptions(
					component.options.map((option: any) => ({
						label: option.label,
						value: option.value,
						description: option.description,
						emoji: option.emoji
					}))
				);
			}

			if (component.minValues) selectMenu.setMinValues(component.minValues);
			if (component.maxValues) selectMenu.setMaxValues(component.maxValues);
			if (component.disabled) selectMenu.setDisabled(true);

			currentRow.addComponents(selectMenu);
			componentsInRow = 5;
		}
	}

	if (componentsInRow > 0) rows.push(currentRow);
	return rows;
}

// Traverse the node graph and execute actions
async function executeNodeGraph(nodes: VisualNode[], edges: VisualEdge[], interaction: ChatInputCommandInteraction) {
	const nodeMap = new Map(nodes.map(n => [n.id, n]));
	const edgeMap = new Map<string, VisualEdge[]>();
	edges.forEach((e: VisualEdge) => {
		if (!edgeMap.has(e.source)) edgeMap.set(e.source, []);
		edgeMap.get(e.source)!.push(e);
	});

	// Find root node
	const root = nodes.find(n => n.type === 'root');
	if (!root) throw new Error('No root node found');

	let currentNode: VisualNode | undefined = root;
	let visited = new Set<string>();

	while (currentNode && !visited.has(currentNode.id)) {
		visited.add(currentNode.id);
		const { type, config } = currentNode.data;

		// Handle node types
		switch (type) {
			case 'root':
				// Start node, move to next
				break;
			case 'send-message': {
				const { content, embeds, components, ephemeral } = config;
				await interaction.reply({
					content: content || undefined,
					embeds: embeds || undefined,
					components: components ? buildComponents(components) : undefined,
					ephemeral: !!ephemeral,
				});
				break;
			}
			case 'condition': {
				const { conditionType, roleId } = config;
				let result = false;
				if (conditionType === 'user-has-role') {
					const member = interaction.guild?.members.cache.get(interaction.user.id);
					result = !!(member && member.roles.cache.has(roleId));
				}
				const outgoing = edgeMap.get(currentNode.id) || [];
				const nextEdge = outgoing.find(e => e.sourceHandle === (result ? 'true' : 'false'));
				if (nextEdge) {
					currentNode = nodeMap.get(nextEdge.target);
					continue;
				}
				break;
			}
			default:
				break;
		}
		const outgoing = edgeMap.get(currentNode.id) || [];
		if (outgoing.length > 0) {
			currentNode = nodeMap.get(outgoing[0].target);
		} else {
			currentNode = undefined;
		}
	}
}

class VisualCommand extends Command {
	private convex: ConvexHttpClient;
	private serverId: string;
	private commandName: string;

	constructor(
		context: Command.LoaderContext,
		options: CommandOptions,
		convex: ConvexHttpClient,
		serverId: string,
		commandName: string,
		commandData: any
	) {
		super(context, {
			...options,
			name: commandName,
			description: commandData.description || 'A visually-built command.'
		});
		this.convex = convex;
		this.serverId = serverId;
		this.commandName = commandName;
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder: any) =>
			builder //
				.setName(this.name)
				.setDescription(this.description)
		);
	}

	override async chatInputRun(interaction: ChatInputCommandInteraction) {
		try {
			const commands = await fetchAllCommandsFromConvex(this.convex, this.serverId);
			const cmd = commands.find((c: any) => c.name === this.commandName);

			if (!cmd) {
				await interaction.reply({
					content: 'Command configuration not found.',
					ephemeral: true
				});
				return;
			}

			let nodes: VisualNode[] = [];
			let edges: VisualEdge[] = [];
			if (typeof cmd.blocks === 'string') {
				try {
					const parsed = JSON.parse(cmd.blocks);
					nodes = parsed.nodes || [];
					edges = parsed.edges || [];
				} catch (e: unknown) {
					await interaction.reply({ content: 'Failed to parse command blocks.', ephemeral: true });
					return;
				}
			}

			await executeNodeGraph(nodes, edges, interaction);
		} catch (error) {
			container.logger.error(`Error in visual command ${this.commandName}:`, error);
			await interaction.reply({
				content: 'An error occurred while processing this command.',
				ephemeral: true
			});
		}
	}
}

async function registerAllVisualCommands(client: SapphireClient, convex: ConvexHttpClient, serverId: string) {
	const commandStore = client.stores.get('commands');
	if (!commandStore) {
		container.logger.error('Command store not found.');
		return;
	}

	try {
		const commands = await fetchAllCommandsFromConvex(convex, serverId);
		container.logger.info(`Fetched ${commands.length} visual commands from Convex.`);

		// Unregister old visual commands to prevent duplicates
		const existingVisualCommands = commandStore.filter((cmd) => cmd instanceof VisualCommand);
		for (const [name] of existingVisualCommands) {
			commandStore.delete(name);
		}
		if (existingVisualCommands.size > 0) {
			container.logger.info(`Unregistered ${existingVisualCommands.size} old visual commands.`);
		}

		// Register new visual commands
		for (const cmd of commands) {
			if (!cmd.name || typeof cmd.name !== 'string' || !/^[a-z0-9_]{1,32}$/.test(cmd.name)) {
				container.logger.error(`Invalid command name: "${cmd.name}". Skipping registration.`);
				continue;
			}

			const commandData = {
				name: cmd.name,
				description: cmd.description || 'A visually-built command.',
				cooldownDelay: cmd.cooldown ?? 0,
				enabled: cmd.enabled !== false
			};

			const context = { name: cmd.name, path: __filename, root: process.cwd(), store: commandStore };
			const visualCommand = new VisualCommand(context, commandData, convex, serverId, cmd.name, cmd);

			commandStore.set(cmd.name, visualCommand);
			container.logger.info(`Successfully loaded visual command: "${cmd.name}"`);
		}

		// Manually trigger re-registration of all commands
		if (client.isReady()) {
			container.logger.info('Client is ready, proceeding with command registration refresh.');
			console.log(commands);
			await client.application?.commands.set(
				commands.map((cmd: any) => ({
					name: cmd.name,
					description: cmd.description || 'A visually-built command.',
					options: cmd.options
				}))
			);
			container.logger.info('Successfully refreshed application commands.');
		} else {
			container.logger.warn('Client not ready, command registration will be delayed.');
		}
	} catch (error) {
		container.logger.error('An error occurred during visual command registration:', error);
	}
}

export function setUpComponentHandlers(client: SapphireClient, _convex: ConvexHttpClient) {
	client.on('interactionCreate', async (interaction) => {
		if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

		try {

			if (interaction.customId.startsWith('visual_')) {
				const serverId = interaction.guildId;
				if (!serverId) return;
			}
		} catch (error) {
			container.logger.error('Error handling component interaction:', error);
		}
	});
}

export { VisualCommand, registerAllVisualCommands };
