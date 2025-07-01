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

// Enhanced component builder
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
				.setStyle(getButtonStyle(component.style));

			if (component.emoji) {
				button.setEmoji(component.emoji);
			}
			if (component.disabled) {
				button.setDisabled(true);
			}

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
			componentsInRow = 5; // Select menus take full row
		}
	}

	if (componentsInRow > 0) {
		rows.push(currentRow);
	}

	return rows;
}

function getButtonStyle(style: string): ButtonStyle {
	switch (style?.toLowerCase()) {
		case 'primary':
			return ButtonStyle.Primary;
		case 'secondary':
			return ButtonStyle.Secondary;
		case 'success':
			return ButtonStyle.Success;
		case 'danger':
			return ButtonStyle.Danger;
		case 'link':
			return ButtonStyle.Link;
		default:
			return ButtonStyle.Primary;
	}
}

// Enhanced command handler
function buildHandler(blocks: any[]) {
	return async (interaction: ChatInputCommandInteraction) => {
		try {
			let shouldRun = true;

			// Process condition blocks first
			for (const block of blocks) {
				if (block.type === 'condition') {
					const { conditionType, conditionValue } = block.config;

					switch (conditionType) {
						case 'message_starts_with': {
							const input = interaction.options.getString('input', false);
							if (!input || !input.startsWith(conditionValue)) {
								shouldRun = false;
							}
							break;
						}
						case 'user_has_role': {
							const member = interaction.guild?.members.cache.get(interaction.user.id);
							if (!member || !member.roles.cache.has(conditionValue)) {
								shouldRun = false;
							}
							break;
						}
						case 'channel_type': {
							if (interaction.channel?.type.toString() !== conditionValue) {
								shouldRun = false;
							}
							break;
						}
					}
				}
			}

			if (!shouldRun) {
				await interaction.reply({
					content: 'You do not meet the requirements to use this command.',
					ephemeral: true
				});
				return;
			}

			// Process action blocks
			for (const block of blocks) {
				switch (block.type) {
					case 'message': {
						const { content, components, flags, embeds } = block.config;

						const replyOptions: any = {
							content: content || undefined,
							ephemeral: flags === 'EPHEMERAL'
						};

						if (components && components.length > 0) {
							replyOptions.components = buildComponents(components);
						}

						if (embeds && embeds.length > 0) {
							replyOptions.embeds = embeds;
						}

						if (interaction.replied || interaction.deferred) {
							await interaction.followUp(replyOptions);
						} else {
							await interaction.reply(replyOptions);
						}
						break;
					}
					case 'role_add': {
						const { roleId } = block.config;
						const member = interaction.guild?.members.cache.get(interaction.user.id);
						if (member && roleId) {
							await member.roles.add(roleId);
						}
						break;
					}
					case 'role_remove': {
						const { roleId } = block.config;
						const member = interaction.guild?.members.cache.get(interaction.user.id);
						if (member && roleId) {
							await member.roles.remove(roleId);
						}
						break;
					}
					case 'delay': {
						const { duration } = block.config;
						await new Promise((resolve) => setTimeout(resolve, duration * 1000));
						break;
					}
				}
			}
		} catch (error) {
			container.logger.error('Error executing visual command:', error);

			const errorMessage = {
				content: 'An error occurred while executing this command.',
				ephemeral: true
			};

			if (interaction.replied || interaction.deferred) {
				await interaction.followUp(errorMessage);
			} else {
				await interaction.reply(errorMessage);
			}
		}
	};
}

// Enhanced Sapphire command class
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
		registry.registerChatInputCommand((builder) =>
			builder //
				.setName(this.name)
				.setDescription(this.description)
		);
	}

	override async chatInputRun(interaction: ChatInputCommandInteraction) {
		try {
			// Fetch the command from Convex
			const commands = await fetchAllCommandsFromConvex(this.convex, this.serverId);
			const cmd = commands.find((c: any) => c.name === this.commandName);

			if (!cmd) {
				await interaction.reply({
					content: 'Command configuration not found.',
					ephemeral: true
				});
				return;
			}

			const blocks = typeof cmd.blocks === 'string' ? JSON.parse(cmd.blocks) : cmd.blocks;
			const handler = buildHandler(blocks);
			await handler(interaction);
		} catch (error) {
			container.logger.error(`Error in visual command ${this.commandName}:`, error);
			await interaction.reply({
				content: 'An error occurred while processing this command.',
				ephemeral: true
			});
		}
	}
}

// Enhanced registration function using Sapphire's registry outside the command class
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

// Component interaction handler (add this to your main bot file)
export function setUpComponentHandlers(client: SapphireClient, _convex: ConvexHttpClient) {
	client.on('interactionCreate', async (interaction) => {
		if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

		try {
			// Handle custom component interactions here
			// You can extend this based on your visual builder needs

			if (interaction.customId.startsWith('visual_')) {
				// Handle visual builder component interactions
				const serverId = interaction.guildId;
				if (!serverId) return;

				// Fetch command data and handle component interactions
				// This is where you'd implement your component logic
			}
		} catch (error) {
			container.logger.error('Error handling component interaction:', error);
		}
	});
}

export { VisualCommand, registerAllVisualCommands };
