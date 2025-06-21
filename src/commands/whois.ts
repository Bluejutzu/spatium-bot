import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry, Awaitable, Command, UserError } from "@sapphire/framework";
import { PrismaClient } from "@prisma/client";
import axios from "axios";
import {
    ApplicationCommandType,
    ApplicationIntegrationType,
    EmbedBuilder,
    InteractionContextType,
    time,
    TimestampStyles,
    GuildMember,
    inlineCode
} from "discord.js";

const prisma = new PrismaClient();

interface MojangProfile {
    id: string;
    name: string;
    properties: {
        name: string;
        value: string;
    }[];
}

@ApplyOptions<Command.Options>({
    description: "Gets a user's info",
    preconditions: ["GuildOnly"]
})

export class UserCommand extends Command {
    public override registerApplicationCommands(registry: ApplicationCommandRegistry): Awaitable<void> {
        const integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall];

        const contexts: InteractionContextType[] = [
            InteractionContextType.Guild
        ];

        registry.registerChatInputCommand((builder) => builder
            .setName(this.name)
            .setDescription(this.description)
            .addUserOption((option) => option
                .setName("user")
                .setDescription("The user to get information about")
                .setRequired(false)
            )
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
        const user = interaction.options.getUser("user") ?? interaction.user;
        const member = await interaction.guild!.members.fetch(user.id).catch(() => null);
        if (!member) throw new UserError({
            identifier: "UserNotFound",
            message: "I could not find that user in the server."
        });

        return this.sendInfo(interaction, member);
    }

    public override async contextMenuRun(interaction: Command.ContextMenuCommandInteraction) {
        if (!interaction.isUserContextMenuCommand()) return;
        const member = await interaction.guild!.members.fetch(interaction.targetId).catch(() => null);
        if (!member) throw new UserError({
            identifier: "UserNotFound",
            message: "I could not find that user in the server."
        });

        return this.sendInfo(interaction, member);
    }

    private async sendInfo(interaction: Command.ChatInputCommandInteraction | Command.ContextMenuCommandInteraction, member: GuildMember) {
        await interaction.deferReply();

        const user = member.user;

        const infoEmbed = new EmbedBuilder()
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
            .setThumbnail(user.displayAvatarURL())
            .setColor(member.displayHexColor)
            .addFields(
                {
                    name: "User",
                    value: [
                        `**Mention:** ${user}`,
                        `**ID:** ${inlineCode(user.id)}`,
                        `**Created:** ${time(user.createdAt, TimestampStyles.RelativeTime)}`
                    ].join("\n"),
                    inline: true
                },
                {
                    name: "Member",
                    value: [
                        `**Nickname:** ${member.nickname ?? "None"}`,
                        `**Joined:** ${member.joinedAt ? time(member.joinedAt, TimestampStyles.RelativeTime) : "Unknown"}`,
                        `**Roles:** ${member.roles.cache.size > 1 ? member.roles.cache.filter(r => r.id !== interaction.guild!.id).map(r => r).join(", ") : "None"}`
                    ].join("\n"),
                    inline: true
                }
            )
            .setFooter({ text: `ID: ${user.id} • ${new Date().toLocaleDateString()}` })
            .setImage(user.bannerURL() ?? null)


        const dbUser = await prisma.users.findUnique({ where: { discord_id: user.id } });

        if (dbUser?.mojang_uuid) {
            try {
                const mojangUUID = dbUser.mojang_uuid.replace(/-/g, "");
                const [profileRes] = await Promise.all([
                    axios.get<MojangProfile>(`https://sessionserver.mojang.com/session/minecraft/profile/${mojangUUID}`),
                ]);

                if (profileRes.status === 200) {
                    const profile = profileRes.data;
                    const textures = JSON.parse(Buffer.from(profile.properties[0].value, "base64").toString());

                    infoEmbed.addFields({
                        name: "Minecraft Account",
                        value: [
                            `**Username:** ${profile.name}`,
                            `**UUID:** ${profile.id}`,
                            `**Skin:** [Download](${textures.textures.SKIN.url})`,
                        ].join("\n"),
                        inline: false
                    });
                    infoEmbed.setThumbnail(`https://crafatar.com/avatars/${profile.id}?overlay`);
                }

            } catch (error) {
                this.container.logger.error("Mojang API request failed", error);
                infoEmbed.addFields({ name: "Minecraft Account", value: "No Mojang (Minecraft) account found associated with " + inlineCode(user.id), inline: false });
            }
        }

        return interaction.editReply({ embeds: [infoEmbed] });
    }
}