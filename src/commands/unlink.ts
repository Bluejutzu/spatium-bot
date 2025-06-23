import { ApplyOptions } from '@sapphire/decorators';
import { ApplicationCommandRegistry, Awaitable, Command, UserError } from '@sapphire/framework';
import {
    ActionRowBuilder,
    ApplicationIntegrationType,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ContainerBuilder,
    GuildMember,
    inlineCode,
    InteractionContextType,
    MessageFlags,
    TextDisplayBuilder
} from 'discord.js';
import { db } from '../db';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

@ApplyOptions<Command.Options>({
    description: 'Remove the link between your mojang (Minecraft) and discord account',
    preconditions: ['GuildTextOnly']
})
export class UserCommand extends Command {
    public override registerApplicationCommands(registry: ApplicationCommandRegistry): Awaitable<void> {
        const integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];

        const contexts: InteractionContextType[] = [InteractionContextType.Guild];

        registry.registerChatInputCommand({
            name: this.name,
            description: this.description,
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

        return this.unlink(interaction, member);
    }

    private async unlink(interaction: Command.ChatInputCommandInteraction, member: GuildMember): Promise<void> {
        await interaction.deferReply({ ephemeral: true });

        const user = member.user;
        const usernameRef = `**${user.username}**`;
        const verificationHint = inlineCode('/verify');

        const container = new ContainerBuilder()
            .setAccentColor(0xff0000)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent([
                    `## 🔗 Unlink Minecraft Account`,
                    `You are about to unlink the Minecraft account associated with ${usernameRef}.`,
                    `This may cause issues on the Minecraft server (e.g. lost perks or access).`,
                    ``,
                    `If you're sure, click **Confirm** below.`,
                    `You can relink anytime with ${verificationHint}.`
                ].join('\n'))
            )
            .addActionRowComponents(
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`unlink-confirm-${user.id}`)
                        .setLabel('Confirm')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`unlink-cancel-${user.id}`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                )
            );

        const message = await interaction.editReply({
            components: [container],
            flags: [MessageFlags.IsComponentsV2]
        });

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (i) => i.user.id === interaction.user.id,
            time: 60_000
        });

        collector.on('collect', async (i) => {
            collector.stop();

            const dbUser = await db.users.findUnique({ where: { discord_id: user.id } });

            if (i.customId.startsWith('unlink-confirm')) {
                if (!dbUser) {
                    await i.update({
                        components: [
                            new TextDisplayBuilder().setContent(
                                `❌ No Minecraft account is currently linked to ${usernameRef}.`
                            )
                        ]
                    });
                    return;
                }

                await db.users.delete({ where: { discord_id: user.id } });

                const payload = JSON.stringify({
                    discord_id: user.id,
                    discord_username: user.tag,
                    mojang_uuid: dbUser.mojang_uuid,
                    mojang_username: dbUser.mojang_username,
                    linked_at: dbUser.linked_at
                });

                await redis.setex(`unlink:${user.id}`, 60, payload);

                await i.update({
                    components: [
                        new TextDisplayBuilder().setContent(
                            [
                                `✅ Successfully unlinked Minecraft account **${dbUser.mojang_username}** from ${usernameRef}.`,
                                `- Cached for 1 minute in case of mistake.`,
                                `- Use ${verificationHint} to relink.`
                            ].join('\n')
                        )
                    ]
                });
            } else {
                await i.update({
                    components: [
                        new TextDisplayBuilder().setContent(`❎ Cancelled unlinking for ${usernameRef}.`)
                    ]
                });
            }
        });

        collector.on('end', (_collected, reason) => {
            if (reason === 'time') {
                const timedOutMsg = new TextDisplayBuilder().setContent(
                    `⌛ Timed out: No response received in 1 minute. Unlinking operation for ${usernameRef} has been cancelled.`
                );
                interaction.editReply({ components: [timedOutMsg] }).catch(() => { });
            }
        });
    }
}
