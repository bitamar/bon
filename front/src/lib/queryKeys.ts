export const queryKeys = {
  me: () => ['me'] as const,
  settings: () => ['settings'] as const,
};

export type QueryKey = ReturnType<(typeof queryKeys)[keyof typeof queryKeys]>;
