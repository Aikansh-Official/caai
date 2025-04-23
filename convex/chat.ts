import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";
import OpenAI from "openai";
import { getAuthUserId } from "@convex-dev/auth/server";

const openai = new OpenAI({
  baseURL: process.env.CONVEX_OPENAI_BASE_URL,
  apiKey: process.env.CONVEX_OPENAI_API_KEY,
});

export const send = mutation({
  args: { content: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Save user message
    await ctx.db.insert("messages", {
      userId,
      content: args.content,
      role: "user"
    });

    // Get AI response
    await ctx.scheduler.runAfter(0, api.chat.generateResponse, { userId, query: args.content });
  }
});

export const generateResponse = action({
  args: { userId: v.id("users"), query: v.string() },
  handler: async (ctx, args) => {
    const prompt = `You are a knowledgeable fitness trainer. Give concise, practical advice for this fitness question: ${args.query}. Keep responses under 150 words and focus on actionable tips.`;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      messages: [{ role: "user", content: prompt }]
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error("No response from AI");

    await ctx.runMutation(api.chat.saveResponse, {
      userId: args.userId,
      content
    });
  }
});

export const saveResponse = mutation({
  args: { userId: v.id("users"), content: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      userId: args.userId,
      content: args.content,
      role: "assistant"
    });
  }
});

export const getMessages = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    
    return await ctx.db
      .query("messages")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();
  }
});
