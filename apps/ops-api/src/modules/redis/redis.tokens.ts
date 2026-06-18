export const REDIS_CLIENT = Symbol("REDIS_CLIENT");

export type RedisClientPort = {
  readonly eval: (
    script: string,
    options: {
      readonly keys: string[];
      readonly arguments: string[];
    }
  ) => Promise<unknown>;
  readonly quit?: () => Promise<unknown>;
};
