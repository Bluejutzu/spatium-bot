import { ApplyOptions } from '@sapphire/decorators';
import { ApplicationCommandRegistry, Awaitable, Command, UserError } from '@sapphire/framework';
import {
	ApplicationCommandType,
	ApplicationIntegrationType,
	InteractionContextType,
	time,
	TimestampStyles,
	GuildMember,
	inlineCode,
	MessageFlags,
	TextDisplayBuilder,
	ContainerBuilder,
} from 'discord.js';

@ApplyOptions<Command.Options>({
	description: "Gets a user's info",
	preconditions: ['GuildOnly']
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: ApplicationCommandRegistry): Awaitable<void> {
		const integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall];

		const contexts: InteractionContextType[] = [InteractionContextType.Guild];

		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.addUserOption((option) => option.setName('user').setDescription('The user to get information about').setRequired(false))
				.setIntegrationTypes(integrationTypes)
				.setContexts(contexts)
		);

		registry.registerContextMenuCommand({
			name: this.name,
			type: ApplicationCommandType.User,
			integrationTypes,
			contexts
		});
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const user = interaction.options.getUser('user') ?? interaction.user;
		const member = await interaction.guild!.members.fetch(user.id).catch(() => null);
		if (!member)
			throw new UserError({
				identifier: 'UserNotFound',
				message: 'I could not find that user in the server.'
			});

		return this.sendInfo(interaction, member);
	}

	public override async contextMenuRun(interaction: Command.ContextMenuCommandInteraction) {
		if (!interaction.isUserContextMenuCommand()) return;
		const member = await interaction.guild!.members.fetch(interaction.targetId).catch(() => null);
		if (!member)
			throw new UserError({
				identifier: 'UserNotFound',
				message: 'I could not find that user in the server.'
			});

		return this.sendInfo(interaction, member);
	}

	private async sendInfo(
		interaction: Command.ChatInputCommandInteraction | Command.ContextMenuCommandInteraction,
		member: GuildMember
	) {
		await interaction.deferReply();

		const user = member.user;
		const bannerUrl = user.bannerURL({ size: 1024 });
		const avatarUrl = user.displayAvatarURL({ size: 1024 });

		const generalSection = [
			`### 👤 General`,
			`**User:** ${user}`,
			`**ID:** ${inlineCode(user.id)}`,
			`**Mention:** <@${user.id}>`,
			`**Created:** ${time(user.createdAt, TimestampStyles.RelativeTime)}`,
			user.hexAccentColor ? `**Banner color:** \`${user.hexAccentColor}\`` : '',
			`[Avatar](${avatarUrl})`,
			bannerUrl ? `[Banner](${bannerUrl})` : ''
		]
			.filter(Boolean)
			.join('\n');

		const serverSection = [
			'### 🛡️ Server',
			`**Joined:** ${member.joinedAt ? time(member.joinedAt, TimestampStyles.RelativeTime) : 'Unknown'}`,
			`**Nickname:** ${member.nickname ?? 'None'}`
		].join('\n');

		const roles = member.roles.cache
			.filter((r) => r.id !== interaction.guild!.id)
			.map((r) => `- ${r}`)
			.join('\n') || 'None';

		const rolesSection = `### 🧩 Roles\n${roles}`;

		const container = new ContainerBuilder()
			.setAccentColor(
				member.displayHexColor === '#000000'
					? 0x2f3136
					: parseInt(member.displayHexColor.replace('#', ''), 16)
			)
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`## 🧾 User Information`)
			)
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(generalSection))
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(serverSection))
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(rolesSection));

		await interaction.editReply({
			components: [container],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
