export const queryKeys = {
  me: () => ['me'] as const,
  settings: () => ['settings'] as const,
  userBusinesses: () => ['businesses'] as const,
  business: (id: string) => ['businesses', id] as const,
  teamMembers: (businessId: string) => ['businesses', businessId, 'team'] as const,
  invitations: (businessId: string) => ['businesses', businessId, 'invitations'] as const,
  myInvitations: () => ['invitations', 'mine'] as const,
  invitation: (token: string) => ['invitations', token] as const,
};

export type QueryKey = ReturnType<(typeof queryKeys)[keyof typeof queryKeys]>;
