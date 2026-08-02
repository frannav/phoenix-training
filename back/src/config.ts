export function getDatabasePath(): string {
  return process.env.DATABASE_PATH ?? "./data/phoenix-training.sqlite";
}

