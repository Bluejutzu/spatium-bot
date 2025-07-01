import type { ConvexHttpClient } from 'convex/browser';

declare module '@sapphire/pieces' {
	interface Container {
		convex: ConvexHttpClient;
		serverId: string;
	}
}
