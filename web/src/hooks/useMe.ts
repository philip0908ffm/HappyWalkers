import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import type { Me, PublicConfig } from '../api/types';

/** Angemeldete Person (oder null). */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api.get<{ me: Me }>('/me')).me;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

export function useSetMe() {
  const qc = useQueryClient();
  return (me: Me | null) => qc.setQueryData(['me'], me);
}

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => api.get<PublicConfig>('/config'),
    staleTime: Infinity,
  });
}
