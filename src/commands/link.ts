import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!); // Upstash-compatible

@ApplyOptions<Command.Options>({
	description: 'Generates a code to verify your Minecraft account.'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
		});
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const user = interaction.user;
		const code = randomBytes(3).toString('hex'); // e.g. '4a2b1f'

		const payload = JSON.stringify({
			discord_id: user.id,
			discord_username: `${user.username}#${user.discriminator}`
		});

		await redis.setex(`verify:${code}`, 300, payload); // Expires in 5 minutes

		await interaction.reply({
			content: `Your verification code is \`${code}\`. Use it with \`/link ${code}\` in the Minecraft server.`,
			ephemeral: true
		});
	}
}
