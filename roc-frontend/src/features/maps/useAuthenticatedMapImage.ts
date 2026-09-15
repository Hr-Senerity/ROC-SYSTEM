import { useEffect, useState } from 'react';
import { apiBlob } from '../../shared/api/client';
import { isAbortError } from '../../shared/api/errors';

interface AuthenticatedImageState {
  src: string | null;
  loading: boolean;
  error: string;
}

export function useAuthenticatedMapImage(
  projectId: string | undefined,
  mapId: string | undefined,
  token: string | null,
  enabled = true,
): AuthenticatedImageState {
  const [state, setState] = useState<AuthenticatedImageState>({
    src: null,
    loading: false,
    error: '',
  });

  useEffect(() => {
    if (!enabled || !projectId || !mapId || !token) {
      setState({ src: null, loading: false, error: '' });
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setState({ src: null, loading: true, error: '' });

    void apiBlob(`/api/projects/${projectId}/maps/${mapId}/image`, {
      token,
      signal: controller.signal,
    }).then((blob) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setState({ src: objectUrl, loading: false, error: '' });
    }).catch((requestError: unknown) => {
      if (isAbortError(requestError)) return;
      setState({
        src: null,
        loading: false,
        error: requestError instanceof Error ? requestError.message : '地图图片加载失败',
      });
    });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [enabled, mapId, projectId, token]);

  return state;
}
