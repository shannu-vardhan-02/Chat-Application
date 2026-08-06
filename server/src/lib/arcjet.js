import arcjet, { shield, detectBot, slidingWindow } from "@arcjet/node";
import { ENV } from "./env.js";

const isDev = ENV.NODE_ENV === "development" || ENV.ARCJET_ENV === "development";

const aj = arcjet({
  key: ENV.ARCJET_KEY,
  rules: [
    // Shield protects your app from common attacks e.g. SQL injection
    shield({ mode: isDev ? "DRY_RUN" : "LIVE" }),
    // Create a bot detection rule
    detectBot({
      mode: isDev ? "DRY_RUN" : "LIVE",
      allow: ["CATEGORY:SEARCH_ENGINE"],
    }),
    // Create a sliding window rate limit (1000 in dev, 100 in production)
    slidingWindow({
      mode: isDev ? "DRY_RUN" : "LIVE",
      max: isDev ? 1000 : 100,
      interval: 60 * 1000,
    }),
  ],
});

export default aj;
