import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    commands: defineTable({
        serverId: v.string(),
        name: v.string(),
        blocks: v.string(), // JSON serialized block structure
        _creationTime: v.optional(v.number()),
        _lastUpdateTime: v.optional(v.number()),
    }).index('by_server', ['serverId']),
})