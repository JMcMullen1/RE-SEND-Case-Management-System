import { useCallback, useEffect, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import {
  decodeViewState,
  defaultViewState,
  encodeViewStateToString,
  type ViewState,
} from '@re-send/shared';

const PREF_KEY = 'resend.viewPrefs';

type Prefs = Pick<ViewState, 'mode' | 'columns' | 'density'>;

function loadPrefs(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as Partial<Prefs>;
  } catch {
    return {};
  }
}

function savePrefs(state: ViewState): void {
  const prefs: Prefs = {
    mode: state.mode,
    columns: state.columns,
    density: state.density,
  };
  localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
}

function initialState(search: string = window.location.search): ViewState {
  if (search && search.length > 1) return decodeViewState(search);
  return { ...defaultViewState(), ...loadPrefs() };
}

export type UpdateViewState = (
  patch: Partial<ViewState> | ((state: ViewState) => ViewState),
) => void;

/**
 * The single case-list view state, mirrored to the URL so a view can be pasted
 * into a chat, with mode/columns/density also persisted per browser.
 */
export function useViewState(): readonly [ViewState, UpdateViewState] {
  const [state, setState] = useState<ViewState>(() => initialState());
  const router = useRouter();

  useEffect(() => {
    const url = `${window.location.pathname}${encodeViewStateToString(state)}`;
    // Through the router, so Back returns to this view of the list.
    router.history.replace(url);
    savePrefs(state);
  }, [state, router]);

  // A link within the app to the list while it is open (e.g. "Cases" in the
  // navigation) doesn't remount it: follow the new address, so the list always
  // matches what the address says.
  useEffect(
    () =>
      router.history.subscribe(({ location, action }) => {
        if (action.type !== 'PUSH' || location.pathname !== '/') return;
        setState(initialState(location.search));
      }),
    [router],
  );

  useEffect(() => {
    const onPop = () => setState(decodeViewState(window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const update = useCallback<UpdateViewState>((patch) => {
    setState((prev) =>
      typeof patch === 'function' ? patch(prev) : { ...prev, ...patch },
    );
  }, []);

  return [state, update] as const;
}
