import { apiGet } from "../../../shared/http/api-client";

export type SystemHealth = {
  status: "ok";
  database: "ready";
};

export function getSystemHealth(): Promise<SystemHealth> {
  return apiGet<SystemHealth>("/api/health");
}

