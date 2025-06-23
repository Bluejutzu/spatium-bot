import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';
import { db } from '../db';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	ContainerBuilder,
	inlineCode,
	InteractionReplyOptions,
	MessageFlags,
	TextDisplayBuilder
} from 'discord.js';

const redis = new Redis(process.env.REDIS_URL!); // Upstash-compatible

@ApplyOptions<Command.Options>({
	description: 'Generates a code to verify your Minecraft account.'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description
		});
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const user = interaction.user;
		const unlinkCacheKey = `unlink:${user.id}`;
		const cachedUnlink = await redis.get(unlinkCacheKey);

		if (cachedUnlink) {
			const cachedData = JSON.parse(cachedUnlink);

			const container = new ContainerBuilder()
				.setAccentColor(0x5865f2)
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(
						`We found a recently unlinked account (${inlineCode(cachedData.mojang_username)}). Would you like to relink it?`
					)
				)
				.addActionRowComponents(
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder().setCustomId(`relink-confirm-${user.id}`).setLabel('Relink').setStyle(ButtonStyle.Success),
						new ButtonBuilder()
							.setCustomId(`relink-cancel-${user.id}`)
							.setLabel('Use a different account')
							.setStyle(ButtonStyle.Secondary)
					)
				);

			const message = await interaction.reply({
				components: [container],
				ephemeral: true,
				flags: MessageFlags.IsComponentsV2
			});

			const collector = message.createMessageComponentCollector({
				componentType: ComponentType.Button,
				filter: (i) => i.user.id === interaction.user.id,
				time: 60_000 // 1 minute
			});

			collector.on('collect', async (i) => {
				collector.stop();
				await redis.del(unlinkCacheKey);

				if (i.customId.startsWith('relink-confirm')) {
					await db.users.create({
						data: {
							discord_id: cachedData.discord_id,
							discord_username: cachedData.discord_username,
							mojang_uuid: cachedData.mojang_uuid,
							mojang_username: cachedData.mojang_username,
							linked_at: new Date(cachedData.linked_at)
						}
					});

					const successMessage = new TextDisplayBuilder().setContent(
						`Successfully relinked your account (${inlineCode(cachedData.mojang_username)}).`
					);
					await i.update({ components: [successMessage] });
				} else {
					await i.update({
						components: [new TextDisplayBuilder().setContent('Cached account discarded. Generating a new verification code...')]
					});
					return this.sendVerificationCode(interaction, true);
				}
			});

			collector.on('end', (_collected, reason) => {
				if (reason === 'time') {
					redis.del(unlinkCacheKey);
					const timedOutMessage = new TextDisplayBuilder().setContent(
						'Confirmation not received within 1 minute, cancelling. The cached account has been discarded.'
					);
					interaction.editReply({ components: [timedOutMessage] }).catch(() => {
						// Ignore error if interaction is no longer available
					});
				}
			});

			return;
		}

		return this.sendVerificationCode(interaction);
	}

	private async sendVerificationCode(interaction: Command.ChatInputCommandInteraction, followup = false) {
		const user = interaction.user;
		const code = randomBytes(3).toString('hex');

		const payload = JSON.stringify({
			discord_id: user.id,
			discord_username: `${user.username}#${user.discriminator}`
		});

		await redis.setex(`verify:${code}`, 300, payload);

		const replyOptions: InteractionReplyOptions = {
			content: `Your verification code is ${inlineCode(code)}. Use it with ${inlineCode(`/link ${code}`)} in the Minecraft server.`,
			flags: ['Ephemeral']
		};

		if (followup) {
			await interaction.followUp(replyOptions);
		} else {
			await interaction.reply(replyOptions);
		}
	}
}
