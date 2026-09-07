import axios from "axios";

export const axiosInstance = axios.create({
  baseURL:
    import.meta.env.MODE === "development"
      ? "http://localhost:3000/api"
      : import.meta.env.VITE_BACKEND_URL || "/api",
  withCredentials: true,
});

// Developer Request Tracking Interceptors
axiosInstance.interceptors.request.use((config) => {
  config.metadata = { startTime: performance.now() };
  if (import.meta.env.MODE === "development") {
    console.log(`[API ->] ${config.method?.toUpperCase()} ${config.url}`);
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => {
    const duration = performance.now() - (response.config.metadata?.startTime || performance.now());
    const reqId = response.headers["x-request-id"] || "-";
    const serverTime = response.headers["x-response-time"] || "";

    if (import.meta.env.MODE === "development") {
      const isSlow = duration > 400;
      const logFn = isSlow ? console.warn : console.log;
      logFn(
        `[API <-] ${response.status} ${response.config.method?.toUpperCase()} ${
          response.config.url
        } (${duration.toFixed(0)}ms${serverTime ? `, server: ${serverTime}` : ""}) [${reqId}]`
      );
    }
    return response;
  },
  (error) => {
    const config = error.config;
    const duration = config?.metadata?.startTime
      ? performance.now() - config.metadata.startTime
      : 0;
    const reqId = error.response?.headers?.["x-request-id"] || "-";

    console.error(
      `[API ERROR] ${config?.method?.toUpperCase()} ${config?.url} failed after ${duration.toFixed(
        0
      )}ms [${reqId}]:`,
      error.response?.data?.message || error.message
    );
    return Promise.reject(error);
  }
);


