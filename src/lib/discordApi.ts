import { DiscordGuild, DiscordUser, DiscordRole, DiscordChannel, DiscordMember } from "./discordTypes";

export class DiscordAPI {
    private accessToken: string;
    private baseURL = 'https://discord.com/api/v10';

    constructor(accessToken: string) {
        this.accessToken = accessToken;
    }

    private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const response = await fetch(`${this.baseURL}${endpoint}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            throw new Error(
                `Discord API error: ${response.status} ${response.statusText}`
            );
        }

        return response.json() as Promise<T>;
    }

    async getCurrentUser(): Promise<DiscordUser> {
        return this.request<DiscordUser>('/users/@me');
    }

    async getUserGuilds(with_counts = true): Promise<DiscordGuild[]> {
        return this.request<DiscordGuild[]>(
            `/users/@me/guilds${with_counts ? '?with_counts=true' : ''}`
        );
    }

    async getBotGuilds(): Promise<DiscordGuild[]> {
        const response = await fetch(`${this.baseURL}/users/@me/guilds`, {
            headers: {
                Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
            },
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Discord API error: ${response.status} ${response.statusText} - ${errorText}`
            );
        }
        return response.json() as Promise<DiscordGuild[]>;
    }

    async getGuild(guildId: string): Promise<DiscordGuild> {
        return this.request<DiscordGuild>(`/guilds/${guildId}?with_counts=true`);
    }

    async getGuildChannels(guildId: string): Promise<DiscordChannel[]> {
        return this.request<DiscordChannel[]>(`/guilds/${guildId}/channels`);
    }

    async getGuildMembers(guildId: string, limit = 100): Promise<DiscordMember[]> {
        return this.request<DiscordMember[]>(`/guilds/${guildId}/members?limit=${limit}`);
    }

    async getGuildWithBotToken(guildId: string, withCounts: boolean): Promise<DiscordGuild> {
        const response = await fetch(
            `${this.baseURL}/guilds/${guildId}${withCounts ? "?with_counts=true" : ""}`,
            {
                headers: {
                    Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
                },
            }
        );
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Discord API error: ${response.status} ${response.statusText} - ${errorText}`
            );
        }
        return response.json() as Promise<DiscordGuild>;
    }

    async getGuildRolesWithBotToken(guildId: string): Promise<DiscordRole[]> {
        const response = await fetch(
            `${this.baseURL}/guilds/${guildId}/roles`,
            {
                headers: {
                    Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
                },
            }
        );
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Discord API error: ${response.status} ${response.statusText} - ${errorText}`
            );
        }
        return response.json() as Promise<DiscordRole[]>;
    }
}

export async function refreshDiscordToken(refreshToken: string) {
    const response = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID!,
            client_secret: process.env.DISCORD_CLIENT_SECRET!,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
    });

    if (!response.ok) {
        throw new Error('Failed to refresh Discord token');
    }

    return response.json();
}
