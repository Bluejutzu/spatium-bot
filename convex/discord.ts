import { v } from 'convex/values';
import {
    query,
} from './_generated/server';

export const getCommands = query({
    args: { serverId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('commands')
            .withIndex('by_server', q => q.eq('serverId', args.serverId))
            .collect();
    },
});