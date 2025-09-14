#!/usr/bin/env node
/**
 * Agent Switchboard — Redis MCP Server
 * Tools: ping, publish, xadd, xread, xgroup_create, xreadgroup, xack, xpending
 * Transport: stdio (Claude, Gemini, Copilot-compatible)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createClient } from "redis";

// Config
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const DEFAULT_EVENTS_STREAM = process.env.AGENT_EVENTS_STREAM || "agent:events";
const DEFAULT_SESSION_STREAM = process.env.AGENT_SESSION_STREAM || "agent:session_log"; // reserved for future use
const DEFAULT_GROUP = process.env.AGENT_CONSUMER_GROUP || "triage";
const DEFAULT_CONSUMER = process.env.AGENT_CONSUMER_NAME || "worker-1";

// Redis client
const redis = createClient({ url: REDIS_URL });
await redis.connect();

// MCP server (high-level API)
const mcp = new McpServer(
  { name: "agent-switchboard-mcp", version: "0.3.0" },
  { capabilities: { tools: {} } }
);

// Health
mcp.tool(
  "redis_ping",
  "Ping the Redis server",
  async () => ({
    content: [
      { type: "text", text: JSON.stringify({ pong: await redis.ping() }) }
    ],
  })
);

// Pub/Sub
mcp.tool(
  "redis_publish",
  "Publish to a Redis pub/sub channel",
  {
    channel: z.string(),
    message: z.string(),
  },
  async ({ channel, message }) => {
    const n = await redis.publish(channel, message);
    return {
      content: [
        { type: "text", text: JSON.stringify({ ok: true, subscribers: n }) },
      ],
    };
  }
);

// Streams: XADD
mcp.tool(
  "redis_xadd",
  "Append an entry to a Redis stream",
  {
    stream: z.string().optional(),
    fields: z.record(z.unknown()),
    id: z.string().optional(),
  },
  async ({ stream = DEFAULT_EVENTS_STREAM, fields, id }) => {
    const newId = await redis.xAdd(stream, id || "*", fields);
    return {
      content: [
        { type: "text", text: JSON.stringify({ ok: true, stream, id: newId }) },
      ],
    };
  }
);

// Streams: XREAD (non-group)
mcp.tool(
  "redis_xread",
  "Read from a Redis stream (non-group)",
  {
    stream: z.string().optional(),
    last_id: z.string().optional(),
    block_ms: z.number().optional(),
    count: z.number().optional(),
  },
  async ({ stream = DEFAULT_EVENTS_STREAM, last_id = "$", block_ms = 0, count = 1 }) => {
    const opts = { COUNT: count };
    if ((block_ms | 0) > 0) opts.BLOCK = block_ms | 0;
    const res = await redis.xRead([{ key: stream, id: last_id }], opts);
    return {
      content: [
        { type: "text", text: JSON.stringify({ ok: true, data: res || [] }) },
      ],
    };
  }
);

// Consumer groups: XGROUP CREATE
mcp.tool(
  "redis_xgroup_create",
  "Create a consumer group on a stream",
  {
    stream: z.string().optional(),
    group: z.string().optional(),
    id: z.string().optional(),
    mkstream: z.boolean().optional(),
  },
  async ({ stream = DEFAULT_EVENTS_STREAM, group = DEFAULT_GROUP, id = "$", mkstream = true }) => {
    try {
      await redis.xGroupCreate(stream, group, id, { MKSTREAM: !!mkstream });
      return {
        content: [
          { type: "text", text: JSON.stringify({ ok: true, stream, group, id }) },
        ],
      };
    } catch (e) {
      if (String(e).includes("BUSYGROUP")) {
        return {
          content: [
            { type: "text", text: JSON.stringify({ ok: true, stream, group, id, note: "Group already exists" }) },
          ],
        };
      }
      throw e;
    }
  }
);

// XREADGROUP
mcp.tool(
  "redis_xreadgroup",
  "Read from a stream using a consumer group",
  {
    stream: z.string().optional(),
    group: z.string().optional(),
    consumer: z.string().optional(),
    count: z.number().optional(),
    block_ms: z.number().optional(),
    id: z.string().optional(),
  },
  async ({ stream = DEFAULT_EVENTS_STREAM, group = DEFAULT_GROUP, consumer = DEFAULT_CONSUMER, count = 1, block_ms = 15000, id = ">" }) => {
    const opts = { COUNT: count };
    if ((block_ms | 0) > 0) opts.BLOCK = block_ms | 0;
    const res = await redis.xReadGroup(group, consumer, [{ key: stream, id }], opts);
    return {
      content: [
        { type: "text", text: JSON.stringify({ ok: true, data: res || [] }) },
      ],
    };
  }
);

// XACK
mcp.tool(
  "redis_xack",
  "Acknowledge one or more messages in a group",
  {
    stream: z.string().optional(),
    group: z.string().optional(),
    ids: z.array(z.string()),
  },
  async ({ stream = DEFAULT_EVENTS_STREAM, group = DEFAULT_GROUP, ids }) => {
    const count = await redis.xAck(stream, group, ...ids);
    return {
      content: [
        { type: "text", text: JSON.stringify({ ok: true, acknowledged: count }) },
      ],
    };
  }
);

// XPENDING
mcp.tool(
  "redis_xpending",
  "Inspect pending messages for a group",
  {
    stream: z.string().optional(),
    group: z.string().optional(),
  },
  async ({ stream = DEFAULT_EVENTS_STREAM, group = DEFAULT_GROUP }) => {
    const info = await redis.xPending(stream, group);
    return {
      content: [
        { type: "text", text: JSON.stringify({ ok: true, pending: info }) },
      ],
    };
  }
);

// Start
const transport = new StdioServerTransport();
await mcp.connect(transport);
console.error("[agent-switchboard] MCP server started.", {
  REDIS_URL,
  DEFAULT_EVENTS_STREAM,
  DEFAULT_GROUP,
  DEFAULT_CONSUMER,
});
